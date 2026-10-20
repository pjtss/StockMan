import { getMarketRssTranslationRetryState } from "./market-rss-retry-display";
import { isMarketRssTranslationReviewEligible } from "./market-rss-translation-review-eligibility";

export type MarketRssTranslationFilter = "all" | "PENDING" | "TRANSLATED" | "NOT_REQUIRED" | "FALLBACK" | "FAILED" | "RETRY_READY" | "REVIEW";

export function matchesMarketRssTranslationFilter(
  article: { translationStatus: string; translationFallback: boolean; translationSkippedReason?: string | null; translationAttempts?: number; translationAttemptedAt?: string | Date | null; notificationStatus?: string },
  filter: MarketRssTranslationFilter,
  now = new Date(),
) {
  if (filter === "all") return true;
  if (filter === "FALLBACK") return article.translationFallback;
  if (filter === "NOT_REQUIRED") return article.translationStatus === "SKIPPED" && !article.translationFallback;
  // Provider/preparation exceptions persist both FAILED and original-title
  // fallback. The FAILED filter must show these rows; FALLBACK remains the
  // broader filter for every reason that currently displays the source title.
  if (filter === "FAILED") return article.translationStatus === "FAILED";
  if (filter === "RETRY_READY") {
    return getMarketRssTranslationRetryState(article, now).retryReady;
  }
  if (filter === "REVIEW") return isMarketRssTranslationReviewEligible(article);
  return !article.translationFallback && article.translationStatus === filter;
}
