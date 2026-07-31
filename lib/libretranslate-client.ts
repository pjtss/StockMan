import type { TranslationClient, TranslationLanguage, TranslationResult } from "./translation-types";

export class LibreTranslateClient implements TranslationClient {
  constructor(private readonly baseUrl = process.env.LIBRETRANSLATE_URL || "http://127.0.0.1:5000", private readonly apiKey = process.env.LIBRETRANSLATE_API_KEY || "") {}
  async translate(text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> {
    const fallback = (fallbackReason: string) => ({ translatedText: text, source, target, provider: "libretranslate", fallback: true, fallbackReason });
    if (!text.trim()) return fallback("empty_text");
    if (process.env.TRANSLATION_ENABLED === "false") return fallback("disabled");
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, source, target, format: "text", ...(this.apiKey ? { api_key: this.apiKey } : {}) }), signal: AbortSignal.timeout(Number(process.env.TRANSLATION_TIMEOUT_MS || 10000)) });
      if (!response.ok) return fallback(`http_${response.status}`);
      const body = await response.json() as { translatedText?: unknown };
      if (!(typeof body.translatedText === "string" && body.translatedText.trim())) return fallback("empty_response");
      return { translatedText: body.translatedText.trim(), source, target, provider: "libretranslate", fallback: false };
    } catch (error) { return fallback(error instanceof Error ? error.name : "request_failed"); }
  }
}
