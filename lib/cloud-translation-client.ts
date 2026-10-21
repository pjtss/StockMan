import type { TranslationClient, TranslationFormat, TranslationLanguage, TranslationRequestOptions, TranslationResult, TranslationSourceLanguage } from "./translation-types";

type TranslationHttpError = Error & { status?: number; retryAfter?: string | null; providerReason?: string };

function retryDelayMs(attempt: number, retryAfter: string | null | undefined, nowMs = Date.now()) {
  const exponential = Math.min(32_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  if (!retryAfter) return exponential;
  const seconds = Number(retryAfter);
  const retryAtMs = Number.isFinite(seconds) && retryAfter.trim() !== ""
    ? nowMs + Math.max(0, seconds) * 1_000
    : Date.parse(retryAfter);
  if (!Number.isFinite(retryAtMs)) return exponential;
  return Math.min(32_000, Math.max(exponential, retryAtMs - nowMs));
}

function isRetryableHttpError(error: TranslationHttpError) {
  if (error.status === 429 || (error.status != null && error.status >= 500)) return true;
  return error.status === 403 && /user[_ ]?rate[_ ]?limit[_ ]?exceeded/i.test(error.providerReason || "");
}

function isTranslationHttpError(error: unknown): error is TranslationHttpError {
  return error instanceof Error && typeof (error as TranslationHttpError).status === "number";
}

function getPositiveIntegerEnv(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

async function parseProviderError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
    const reason = body.error?.errors?.find((entry) => entry.reason)?.reason;
    const message = body.error?.message || "";
    if (reason) return reason;
    if (/user rate limit exceeded/i.test(message)) return "userRateLimitExceeded";
    if (/daily limit exceeded/i.test(message)) return "dailyLimitExceeded";
  } catch { /* provider error details are optional */ }
  return "";
}

/** Google Cloud Translation Basic (v2) client authenticated by API key. */
export class CloudTranslationClient implements TranslationClient {
  constructor(private readonly apiKey: string) {}
  static fromEnvironment() {
    const apiKey = process.env.GOOGLE_TRANSLATION_API_KEY?.trim();
    return apiKey ? new CloudTranslationClient(apiKey) : null;
  }
  async translate(text: string, source: TranslationSourceLanguage = "en", target: TranslationLanguage = "ko", format: TranslationFormat = "text", options?: TranslationRequestOptions): Promise<TranslationResult> {
    const requestedSource: TranslationLanguage = source === "auto" ? "en" : source;
    if (!text.trim()) return { translatedText: "", source: requestedSource, target, provider: "google-cloud-translation", fallback: false };
    const url = new URL("https://translation.googleapis.com/language/translate/v2");
    const attempts = getPositiveIntegerEnv("CLOUD_TRANSLATION_RETRIES", 3);
    // Node timers clamp values above 2^31-1 to 1 ms; reject them instead of
    // accidentally turning a huge timeout configuration into an immediate one.
    const timeoutMs = getPositiveIntegerEnv("CLOUD_TRANSLATION_TIMEOUT_MS", 15_000, 2_147_483_647);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await options?.beforeRequest?.();
        const requestBody = { q: text, ...(source === "auto" ? {} : { source }), target, format };
        const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) {
          const providerReason = await parseProviderError(response);
          const error = Object.assign(new Error(`Cloud Translation HTTP ${response.status}${providerReason ? ` (${providerReason})` : ""}`), {
            status: response.status,
            retryAfter: response.headers.get("retry-after"),
            providerReason,
          }) as TranslationHttpError;
          if (!isRetryableHttpError(error) || attempt === attempts) throw error;
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, error.retryAfter)));
          continue;
        }
        let body: { data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> } };
        try {
          body = await response.json() as typeof body;
        } catch {
          throw new Error("Cloud Translation response contained invalid JSON");
        }
        const translation = body.data?.translations?.[0];
        const translatedText = translation?.translatedText;
        // A whitespace-only payload is unusable but transient provider output
        // can recover on retry. Malformed/missing fields are contract errors.
        if (typeof translatedText !== "string") throw new Error("Cloud Translation response missing translatedText");
        if (!translatedText.trim()) {
          if (attempt === attempts) throw new Error("Cloud Translation response missing usable translatedText");
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, null)));
          continue;
        }
        const detectedSource = translation?.detectedSourceLanguage;
        // The public source type only models explicit English/Korean inputs.
        // If auto-detection reports another language (or omits the field), do
        // not mislabel that input as English in the result metadata.
        const resolvedSource: TranslationSourceLanguage = source === "auto"
          ? detectedSource === "en" || detectedSource === "ko" ? detectedSource : "auto"
          : requestedSource;
        return { translatedText, source: resolvedSource, target, provider: "google-cloud-translation", fallback: false };
      } catch (error) {
        const httpError: TranslationHttpError = isTranslationHttpError(error) ? error : error instanceof Error ? error : new Error(String(error));
        if (httpError.status != null && (!isRetryableHttpError(httpError) || attempt === attempts)) throw error;
        if (httpError.status == null && attempt === attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, httpError.retryAfter)));
      }
    }
    throw new Error("Cloud Translation failed after retries");
  }
}
