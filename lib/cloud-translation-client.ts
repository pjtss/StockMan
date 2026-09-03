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
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, source, target, format: "text" }), signal: AbortSignal.timeout(Number(process.env.CLOUD_TRANSLATION_TIMEOUT_MS || 15000)) });
    if (!response.ok) throw new Error(`Cloud Translation HTTP ${response.status}`);
    const body = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
    const translatedText = body.data?.translations?.[0]?.translatedText;
    if (!translatedText) throw new Error("Cloud Translation response missing translatedText");
    return { translatedText, source, target, provider: "google-cloud-translation", fallback: false };
  }
}
