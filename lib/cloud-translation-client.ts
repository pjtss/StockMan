import type { TranslationClient, TranslationLanguage, TranslationResult } from "./translation-types";

/** Google Cloud Translation Basic (v2) client authenticated by API key. */
export class CloudTranslationClient implements TranslationClient {
  constructor(private readonly apiKey: string) {}
  static fromEnvironment() {
    const apiKey = process.env.GOOGLE_TRANSLATION_API_KEY?.trim();
    return apiKey ? new CloudTranslationClient(apiKey) : null;
  }
  async translate(text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> {
    if (!text.trim()) return { translatedText: "", source, target, provider: "google-cloud-translation", fallback: false };
    const url = new URL("https://translation.googleapis.com/language/translate/v2");
    url.searchParams.set("key", this.apiKey);
    const attempts = Math.max(1, Number(process.env.CLOUD_TRANSLATION_RETRIES || 3));
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, source, target, format: "text" }), signal: AbortSignal.timeout(Number(process.env.CLOUD_TRANSLATION_TIMEOUT_MS || 15000)) });
        if (!response.ok) { const error = new Error(`Cloud Translation HTTP ${response.status}`); if (attempt === attempts || (response.status < 500 && response.status !== 429)) throw error; throw error; }
        const body = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
        const translatedText = body.data?.translations?.[0]?.translatedText;
        if (!translatedText) throw new Error("Cloud Translation response missing translatedText");
        return { translatedText, source, target, provider: "google-cloud-translation", fallback: false };
      } catch (error) { const message = error instanceof Error ? error.message : String(error); const status = Number(message.match(/HTTP (\d+)/)?.[1] || 0); if (attempt === attempts || (status >= 400 && status < 500 && status !== 429)) throw error; await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 4000))); }
    }
    throw new Error("Cloud Translation failed after retries");
  }
}
