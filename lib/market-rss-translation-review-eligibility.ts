const CANDIDATE_REVIEW_REASONS = new Set([
  "translation_output_incomplete",
  "target_language_not_detected",
  "translation_numeric_hallucination",
  "translation_cache_invalidation_failed",
]);

export type MarketRssTranslationReviewEligibilityInput = {
  translationStatus: string;
  translationFallback: boolean;
  translationSkippedReason?: string | null;
  translatedTitle?: string | null;
  translationCandidateTitle?: string | null;
};

/** Keep the UI filter and CSV export on one definition of human-reviewable rows. */
export function isMarketRssTranslationReviewEligible(article: MarketRssTranslationReviewEligibilityInput) {
  const successfulProviderTranslation = article.translationStatus === "TRANSLATED"
    && !article.translationFallback
    && article.translationSkippedReason !== "already_in_target_language"
    && typeof article.translatedTitle === "string"
    && article.translatedTitle.trim().length > 0;
  const retainedQualityCandidate = article.translationFallback
    && CANDIDATE_REVIEW_REASONS.has(article.translationSkippedReason || "")
    && typeof article.translationCandidateTitle === "string"
    && article.translationCandidateTitle.trim().length > 0;
  return successfulProviderTranslation || retainedQualityCandidate;
}
