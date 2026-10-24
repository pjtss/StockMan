import type { TranslationClient, TranslationFormat, TranslationLanguage, TranslationRequestOptions, TranslationResult, TranslationSourceLanguage } from "./translation-types";

type AzureError = Error & {
  status?: number;
  retryAfter?: string | null;
  providerReason?: string;
  providerCode?: string | null;
  requestId?: string | null;
};
const PROVIDER = "azure-translator";

export function getAzureTranslatorEndpointDiagnostics(endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT?.trim() || "") {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return {
      host: url.host,
      path: url.pathname,
      queryPresent: Boolean(url.search),
      pathAlreadyContainsTranslate: /(?:^|\/)translate\/?$/i.test(url.pathname),
    };
  } catch {
    return null;
  }
}

function retryDelay(attempt: number, header: string | null) {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(30_000, seconds * 1000) : Math.min(8_000, 500 * 2 ** (attempt - 1));
}

function buildTranslateUrl(endpoint: string, target: TranslationLanguage, source: TranslationSourceLanguage, format: TranslationFormat) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!/(?:^|\/)translate$/i.test(url.pathname)) url.pathname = `${url.pathname}/translate`;
  url.searchParams.set("api-version", "3.0");
  url.searchParams.set("to", target);
  if (source !== "auto") url.searchParams.set("from", source);
  if (format === "html") url.searchParams.set("textType", "html");
  return url;
}

export class AzureTranslationClient implements TranslationClient {
  constructor(private readonly key: string, private readonly endpoint: string, private readonly region?: string) {}

  static fromEnvironment() {
    const key = process.env.AZURE_TRANSLATOR_API_KEY?.trim();
    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT?.trim();
    const region = process.env.AZURE_TRANSLATOR_REGION?.trim();
    // Require an explicit SKU attestation: a paid S1 resource is never silently treated as F0.
    if (!key || !endpoint || process.env.AZURE_TRANSLATOR_FREE_TIER_CONFIRMED?.trim() !== "F0") return null;
    return new AzureTranslationClient(key, endpoint.replace(/\/$/, ""), region || undefined);
  }

  async translate(text: string, source: TranslationSourceLanguage = "auto", target: TranslationLanguage = "ko", _format: TranslationFormat = "text", options?: TranslationRequestOptions): Promise<TranslationResult> {
    const url = buildTranslateUrl(this.endpoint, target, source, _format);
    if (text.length > 50_000) throw new Error("Azure Translator request exceeds the documented 50,000-character request limit");
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await options?.beforeRequest?.();
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "Ocp-Apim-Subscription-Key": this.key, ...(this.region ? { "Ocp-Apim-Subscription-Region": this.region } : {}) },
          body: JSON.stringify([{ text }]),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          let providerReason = "";
          let providerCode: string | null = null;
          try {
            const body = await response.json() as { error?: { code?: string | number; message?: string } };
            providerCode = body.error?.code == null ? null : String(body.error.code).slice(0, 80);
            providerReason = `${providerCode ?? ""} ${body.error?.message ?? ""}`.trim();
          } catch { /* diagnostic body is optional */ }
          const requestId = response.headers.get("x-requestid") || response.headers.get("x-ms-request-id") || response.headers.get("x-correlation-id");
          const error = Object.assign(new Error(`Azure Translator HTTP ${response.status}${providerReason ? ` (${providerReason})` : ""}`), {
            status: response.status,
            retryAfter: response.headers.get("retry-after"),
            providerReason,
            providerCode,
            requestId: requestId && /^[\w.:-]{1,128}$/.test(requestId) ? requestId : null,
          }) as AzureError;
          if ((response.status !== 429 && response.status < 500) || attempt === attempts) throw error;
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, error.retryAfter ?? null)));
          continue;
        }
        const body = await response.json() as Array<{ translations?: Array<{ text?: string; to?: string }> }>;
        const translatedText = body[0]?.translations?.[0]?.text;
        if (typeof translatedText !== "string" || !translatedText.trim()) throw new Error("Azure Translator response did not include translated text");
        return { translatedText, source, target, provider: PROVIDER, fallback: false };
      } catch (error) {
        const status = (error as AzureError)?.status;
        if (status != null && status !== 429 && status < 500) throw error;
        if (attempt === attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, (error as AzureError)?.retryAfter ?? null)));
      }
    }
    throw new Error("Azure Translator failed after retries");
  }
}
