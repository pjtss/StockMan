import { prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import type { TranslatedMarketRssItem } from "./translate-market-rss-item";
import { countTranslationCharacters } from "./translation-cache";

export function buildMarketRssTranslationPersistence(
  row: { title: string; translationAttempts: number },
  result: TranslatedMarketRssItem,
  processedAt = new Date(),
) {
  const notRequired = result.translationNotRequired === true;
  const providerAttempts = result.translationProviderAttempts ?? (!notRequired && (
    result.requestOrigin === "PROVIDER"
    || (result.requestOrigin === undefined
      && result.translationFallbackReason !== "cloud_translation_not_configured"
      && result.translationFallbackReason !== "monthly_character_limit_reached"
      && result.translationFallbackReason !== "translation_input_empty")
  ) ? 1 : 0);
  const providerCalled = !notRequired && providerAttempts > 0;
  return {
    translatedTitle: result.translatedTitle,
    translationCandidateTitle: result.translationCandidateTitle ?? null,
    translatedSummary: result.translatedSummary,
    translatedContent: result.translatedContent ?? null,
    translationProvider: providerCalled ? "google-cloud-translation" : null,
    translationCharCount: providerCalled ? countTranslationCharacters(prepareMarketRssTranslationInput(row.title, result.summary).text) * providerAttempts : 0,
    translationSkippedReason: notRequired ? "already_in_target_language" : result.translationFallbackReason ?? null,
    translationTranslatedAt: result.translationFallback || notRequired ? null : processedAt,
    translationAttemptedAt: processedAt,
    translationFallback: result.translationFallback,
    translationError: result.translationFallbackReason || null,
    translationAttempts: row.translationAttempts + (result.translationFallbackReason === "cloud_translation_not_configured" || notRequired ? 0 : 1),
    translationStatus: result.translationFallback || notRequired ? "SKIPPED" : "TRANSLATED",
    updatedAt: processedAt,
  };
}
