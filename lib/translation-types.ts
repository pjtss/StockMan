export type TranslationLanguage = "en" | "ko";
export type TranslationResult = { translatedText: string; source: TranslationLanguage; target: TranslationLanguage; provider: string; fallback: boolean };
export interface TranslationClient { translate(text: string, source?: TranslationLanguage, target?: TranslationLanguage): Promise<TranslationResult>; }
