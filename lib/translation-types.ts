export type TranslationLanguage = "en" | "ko";
export type TranslationResult = { translatedText: string; source: TranslationLanguage; target: TranslationLanguage; provider: string; fallback: boolean; fallbackReason?: string };
export interface TranslationClient { translate(text: string, source?: TranslationLanguage, target?: TranslationLanguage): Promise<TranslationResult>; }
