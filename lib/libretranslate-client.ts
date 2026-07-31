import type { TranslationClient, TranslationLanguage, TranslationResult } from "./translation-types";

export class LibreTranslateClient implements TranslationClient {
  constructor(private readonly baseUrl = process.env.LIBRETRANSLATE_URL || "http://127.0.0.1:5000", private readonly apiKey = process.env.LIBRETRANSLATE_API_KEY || "") {}
  async translate(text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> {
    const fallback = { translatedText: text, source, target, provider: "libretranslate", fallback: true } as const;
    if (!text.trim() || process.env.TRANSLATION_ENABLED === "false") return fallback;
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, source, target, format: "text", ...(this.apiKey ? { api_key: this.apiKey } : {}) }), signal: AbortSignal.timeout(Number(process.env.TRANSLATION_TIMEOUT_MS || 10000)) });
      if (!response.ok) return fallback;
      const body = await response.json() as { translatedText?: unknown };
      const translatedText = typeof body.translatedText === "string" && body.translatedText.trim() ? body.translatedText.trim() : text;
      return { translatedText, source, target, provider: "libretranslate", fallback: translatedText === text };
    } catch { return fallback; }
  }
}
