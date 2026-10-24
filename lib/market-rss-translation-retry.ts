import { and, eq, gte, lte, lt, or } from "drizzle-orm";
import { marketRssArticles } from "./schema";
import { MARKET_RSS_TRANSLATION_MAX_ATTEMPTS, MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS, MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS } from "./market-rss-translation-retry-constants";
import { prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { countTranslationCharacters } from "./translation-cache";
import { TranslationClientOperationError } from "./translation-types";
import { getPacificQuotaDayStart } from "./translation-quota-window";

export function getMarketRssTranslationRetryCriteria(clientConfigured: boolean, now = new Date()) {
  const failureRetryBefore = MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS.map((delay) => new Date(now.getTime() - delay));
  const monthlyQuotaRetryBefore = clientConfigured
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : null;
  const providerDailyQuotaRetryBefore = clientConfigured ? getPacificQuotaDayStart(now) : null;
  const hourlyQuotaRetryBefore = clientConfigured ? new Date(now.getTime() - 60 * 60_000) : null;
  return {
    failedBeforeAttempt: MARKET_RSS_TRANSLATION_MAX_ATTEMPTS,
    failureRetryBefore,
    exhaustedFailureRetryBefore: new Date(now.getTime() - MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS.at(-1)!),
    retrySkippedImmediatelyReasons: clientConfigured ? ["cloud_translation_not_configured"] : [],
    retrySkippedWithBackoffReasons: clientConfigured ? [...MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS] : [],
    monthlyQuotaRetryBefore,
    providerDailyQuotaRetryBefore,
    hourlyQuotaRetryBefore,
  };
}

export function buildMarketRssTranslationRetryCondition(criteria: ReturnType<typeof getMarketRssTranslationRetryCriteria>) {
  const skippedRetryConditions = criteria.retrySkippedImmediatelyReasons.map((reason) =>
    and(
      eq(marketRssArticles.translationStatus, "SKIPPED"),
      eq(marketRssArticles.translationSkippedReason, reason),
      lt(marketRssArticles.translationAttempts, criteria.failedBeforeAttempt),
    ),
  );
  const skippedRetryWithBackoffConditions = criteria.retrySkippedWithBackoffReasons.flatMap((reason) =>
    criteria.failureRetryBefore.map((retryBefore, index) =>
      and(
        eq(marketRssArticles.translationStatus, "SKIPPED"),
        eq(marketRssArticles.translationSkippedReason, reason),
        eq(marketRssArticles.translationAttempts, index + 1),
        lte(marketRssArticles.translationAttemptedAt, retryBefore),
      ),
    ),
  );
  const failedRetryConditions = criteria.failureRetryBefore.map((retryBefore, index) =>
    and(
      eq(marketRssArticles.translationStatus, "FAILED"),
      eq(marketRssArticles.translationAttempts, index + 1),
      lte(marketRssArticles.translationAttemptedAt, retryBefore),
    ),
  );
  // Keep failed translations eligible after the short initial retry schedule
  // so a temporary provider outage cannot permanently strand an article.
  const exhaustedFailureRetryConditions = [
    and(
      eq(marketRssArticles.translationStatus, "FAILED"),
      gte(marketRssArticles.translationAttempts, criteria.failedBeforeAttempt),
      lte(marketRssArticles.translationAttemptedAt, criteria.exhaustedFailureRetryBefore),
    ),
    ...criteria.retrySkippedWithBackoffReasons.map((reason) => and(
      eq(marketRssArticles.translationStatus, "SKIPPED"),
      eq(marketRssArticles.translationSkippedReason, reason),
      gte(marketRssArticles.translationAttempts, criteria.failedBeforeAttempt),
      lte(marketRssArticles.translationAttemptedAt, criteria.exhaustedFailureRetryBefore),
    )),
  ];
  if (criteria.monthlyQuotaRetryBefore) skippedRetryConditions.push(and(
    eq(marketRssArticles.translationStatus, "SKIPPED"),
    or(eq(marketRssArticles.translationSkippedReason, "monthly_character_limit_reached"), eq(marketRssArticles.translationSkippedReason, "provider_free_quota_exceeded")),
    lt(marketRssArticles.translationAttemptedAt, criteria.monthlyQuotaRetryBefore),
  ));
  if (criteria.providerDailyQuotaRetryBefore) skippedRetryConditions.push(and(
    eq(marketRssArticles.translationStatus, "SKIPPED"),
    eq(marketRssArticles.translationSkippedReason, "provider_daily_quota_exceeded"),
    lt(marketRssArticles.translationAttemptedAt, criteria.providerDailyQuotaRetryBefore),
  ));
  if (criteria.hourlyQuotaRetryBefore) skippedRetryConditions.push(and(
    eq(marketRssArticles.translationStatus, "SKIPPED"),
    eq(marketRssArticles.translationSkippedReason, "hourly_character_limit_reached"),
    lt(marketRssArticles.translationAttemptedAt, criteria.hourlyQuotaRetryBefore),
  ));
  return or(
    eq(marketRssArticles.translationStatus, "PENDING"),
    ...failedRetryConditions,
    ...exhaustedFailureRetryConditions,
    ...skippedRetryConditions,
    ...skippedRetryWithBackoffConditions,
  );
}

/** Select only retry-eligible translations that can produce a user notification. */
export function buildMarketRssTranslationCandidateCondition(criteria: ReturnType<typeof getMarketRssTranslationRetryCriteria>) {
  return and(
    buildMarketRssTranslationRetryCondition(criteria),
    eq(marketRssArticles.notifyEligible, true),
    eq(marketRssArticles.isBacklog, false),
  );
}

export function sanitizeMarketRssTranslationError(error: unknown) {
  if (!(error instanceof Error) && typeof error !== "string") return "Unknown translation error";
  const rawMessage = error instanceof Error ? error.message : error;
  return rawMessage
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        for (const key of [...url.searchParams.keys()]) {
        if (/key|token|secret|auth|credential|pass(?:word|wd)?|pwd/i.test(key)) url.searchParams.set(key, "[redacted]");
        }
        url.username = "";
        url.password = "";
        return url.toString();
      } catch {
        return "[redacted URL]";
      }
    })
    .replace(/(\bauthorization\s*[:=]\s*)(?:bearer\s+)?("[^"]*"|'[^']*'|[^\s,;)}]+)/gi, "$1[redacted]")
    .replace(/((?:api[\s_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;)}]+)/gi, "$1[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function makeMarketRssTranslationFailureFallback(row: {
  title: string;
  summary: string;
  translationAttempts: number;
}, error: unknown, now = new Date(), providerRequestAttempted = false) {
  const preparationFailed = error instanceof TranslationClientOperationError && error.stage !== "provider_request";
  const providerError = error instanceof TranslationClientOperationError ? error.originalError : error;
  const providerReason = providerError && typeof providerError === "object" && "providerReason" in providerError
    ? String(providerError.providerReason)
    : "";
  const providerDailyQuotaExceeded = !preparationFailed && providerReason === "dailyLimitExceeded";
  const providerFreeQuotaExceeded = !preparationFailed && providerReason.includes("403001");
  const providerAttempts = error instanceof TranslationClientOperationError
    ? error.providerAttempts
    : providerRequestAttempted ? 1 : 0;
  return {
    translatedTitle: row.title,
    translatedSummary: row.summary,
    translationTranslatedAt: null,
    translationFallback: true,
    translationSkippedReason: preparationFailed ? "translation_preparation_error" : providerDailyQuotaExceeded ? "provider_daily_quota_exceeded" : providerFreeQuotaExceeded ? "provider_free_quota_exceeded" : "translation_api_error",
    translationError: sanitizeMarketRssTranslationError(error),
    translationProvider: providerRequestAttempted ? (error instanceof TranslationClientOperationError ? error.provider ?? "google-cloud-translation" : "google-cloud-translation") : null,
    translationCharCount: providerAttempts > 0 ? countTranslationCharacters(prepareMarketRssTranslationInput(row.title).text, error instanceof TranslationClientOperationError ? error.provider ?? undefined : undefined) * providerAttempts : 0,
    translationProviderAttempts: providerAttempts,
    translationAttempts: row.translationAttempts + 1,
    translationStatus: providerDailyQuotaExceeded ? "SKIPPED" as const : "FAILED" as const,
    updatedAt: now,
  };
}
