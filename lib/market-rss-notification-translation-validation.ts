import { normalizeTranslatedMarketRssClinicalPhase } from "./market-rss-headline-context";
import { isMarketRssTranslationHeadlineComplete, isMarketRssTranslationKoreanEnough } from "./market-rss-translation-quality";

export type StoredMarketRssTranslationFailureReason = "target_language_not_detected" | "translation_output_incomplete";

export function validateStoredMarketRssTranslation(sourceTitle: string, translatedTitle: string) {
  const normalizedTitle = normalizeTranslatedMarketRssClinicalPhase(sourceTitle, translatedTitle);
  if (!isMarketRssTranslationKoreanEnough(normalizedTitle)) {
    return { ok: false as const, translatedTitle: normalizedTitle, reason: "target_language_not_detected" as const };
  }
  if (!isMarketRssTranslationHeadlineComplete(sourceTitle, normalizedTitle)) {
    return { ok: false as const, translatedTitle: normalizedTitle, reason: "translation_output_incomplete" as const };
  }
  return { ok: true as const, translatedTitle: normalizedTitle, changed: normalizedTitle !== translatedTitle };
}

export function buildStoredMarketRssTranslationRetryState(
  row: { title: string; translationAttempts: number },
  validation: { reason: StoredMarketRssTranslationFailureReason; translatedTitle: string },
  failedAt = new Date(),
) {
  return {
    translatedTitle: row.title,
    translationCandidateTitle: validation.translatedTitle,
    translationStatus: "FAILED" as const,
    translationFallback: true,
    translationSkippedReason: validation.reason,
    translationError: "Stored title failed send-time validation and must be translated again.",
    translationTranslatedAt: null,
    translationAttemptedAt: failedAt,
    translationAttempts: row.translationAttempts + 1,
    updatedAt: failedAt,
  };
}
