import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildMarketRssTranslationCandidateCondition, buildMarketRssTranslationRetryCondition, getMarketRssTranslationRetryCriteria, makeMarketRssTranslationFailureFallback } from "./market-rss-translation-retry";
import { MARKET_RSS_TRANSLATION_MAX_ATTEMPTS, MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS } from "./market-rss-translation-retry-constants";
import { TranslationClientOperationError } from "./translation-types";
import { countTranslationCharacters } from "./translation-cache";
import { prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { getPacificQuotaDayStart } from "./translation-quota-window";
import { CloudTranslationClient } from "./cloud-translation-client";
import { countMarketRssTranslationFallbackReasons } from "./market-rss-translation-fallback-count";

afterEach(() => vi.unstubAllGlobals());

describe("market RSS translation retry criteria", () => {
  it("only rechecks a monthly-quota fallback after the UTC month changes", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    expect(getMarketRssTranslationRetryCriteria(true, now).monthlyQuotaRetryBefore).toEqual(now);
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-31T22:00:00.000Z")).monthlyQuotaRetryBefore)
      .toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("backs off provider failures for one minute, then five minutes before exhausting retries", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(getMarketRssTranslationRetryCriteria(true, now).failureRetryBefore).toEqual([
      new Date("2026-10-18T11:59:00.000Z"),
      new Date("2026-10-18T11:55:00.000Z"),
    ]);
    expect(getMarketRssTranslationRetryCriteria(true, now).failureRetryBefore.map((retryAt, index) => now.getTime() - retryAt.getTime()))
      .toEqual([...MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS]);
    expect(getMarketRssTranslationRetryCriteria(true, now).failedBeforeAttempt).toBe(MARKET_RSS_TRANSLATION_MAX_ATTEMPTS);
  });

  it("does not keep selecting configuration fallbacks while the key is still missing", () => {
    expect(getMarketRssTranslationRetryCriteria(false, new Date("2026-10-01T00:00:00.000Z"))).toEqual({
      failedBeforeAttempt: 3,
      failureRetryBefore: [new Date("2026-09-30T23:59:00.000Z"), new Date("2026-09-30T23:55:00.000Z")],
      exhaustedFailureRetryBefore: new Date("2026-09-30T23:55:00.000Z"),
      retrySkippedImmediatelyReasons: [],
      retrySkippedWithBackoffReasons: [],
      monthlyQuotaRetryBefore: null,
      providerDailyQuotaRetryBefore: null,
      hourlyQuotaRetryBefore: null,
    });
  });

  it("makes configuration fallback rows retryable when a client is restored", () => {
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedImmediatelyReasons)
      .toContain("cloud_translation_not_configured");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("protected_token_mismatch");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("target_language_not_detected");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("translation_output_incomplete");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("translation_numeric_hallucination");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("translation_response_unparseable");
    expect(getMarketRssTranslationRetryCriteria(true, new Date("2026-10-01T00:00:00.000Z")).retrySkippedWithBackoffReasons)
      .toContain("translation_input_empty");
  });

  it("builds SQL that retries missing configuration immediately but backs off provider validation failures", () => {
    const criteria = getMarketRssTranslationRetryCriteria(true, new Date("2026-10-18T12:00:00.000Z"));
    const query = new PgDialect().sqlToQuery(buildMarketRssTranslationRetryCondition(criteria)!);
    expect(query.sql).toContain('"translation_skipped_reason"');
    expect(query.sql).toContain('"translation_attempted_at" <');
    expect(query.sql).toContain('"translation_attempted_at" <=');
    expect(query.params).toContain("cloud_translation_not_configured");
    expect(query.params).toContain("target_language_not_detected");
    expect(query.params).toContain("translation_output_incomplete");
    expect(query.params).toContain("translation_numeric_hallucination");
    expect(query.params).toContain("protected_token_mismatch");
    expect(query.params).toContain("monthly_character_limit_reached");
    expect(query.params).toContain("provider_daily_quota_exceeded");
    expect(query.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain("2026-10-01T00:00:00.000Z");
    expect(query.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain("2026-10-18T11:59:00.000Z");
    expect(query.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain("2026-10-18T11:55:00.000Z");
    expect(query.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain(getPacificQuotaDayStart(new Date("2026-10-18T12:00:00.000Z")).toISOString());
  });

  it("limits provider translation candidates to notification-eligible non-backlog rows", () => {
    const criteria = getMarketRssTranslationRetryCriteria(true, new Date("2026-10-18T12:00:00.000Z"));
    const query = new PgDialect().sqlToQuery(buildMarketRssTranslationCandidateCondition(criteria));

    expect(query.sql).toContain('"market_rss_articles"."notify_eligible" =');
    expect(query.sql).toContain('"market_rss_articles"."is_backlog" =');
    expect(query.params).toContain(true);
    expect(query.params).toContain(false);
    expect(query.params).toContain("PENDING");
    expect(query.params).toContain("FAILED");
    expect(query.params).toContain("SKIPPED");
  });

  it("does not add an attempt-time gate to restored configuration but gates validation retries by attempt time", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    const base = getMarketRssTranslationRetryCriteria(true, now);
    const immediate = new PgDialect().sqlToQuery(buildMarketRssTranslationRetryCondition({
      ...base,
      failureRetryBefore: [],
      retrySkippedWithBackoffReasons: [],
      monthlyQuotaRetryBefore: null,
      providerDailyQuotaRetryBefore: null,
    })!);
    expect(immediate.params).toContain("cloud_translation_not_configured");
    expect(immediate.sql).toContain('"translation_attempted_at"');
    expect(immediate.params).toContain("hourly_character_limit_reached");

    const delayed = new PgDialect().sqlToQuery(buildMarketRssTranslationRetryCondition({
      ...base,
      failureRetryBefore: [new Date("2026-10-18T11:59:00.000Z")],
      retrySkippedImmediatelyReasons: [],
      retrySkippedWithBackoffReasons: ["target_language_not_detected"],
      monthlyQuotaRetryBefore: null,
      providerDailyQuotaRetryBefore: null,
    })!);
    expect(delayed.params).toContain("target_language_not_detected");
    expect(delayed.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain("2026-10-18T11:59:00.000Z");
    expect(delayed.sql).toContain('"translation_attempted_at" <=');
  });

  it("marks provider errors as visible original-title fallback while retaining retry status", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const fallback = makeMarketRssTranslationFailureFallback({ title: "Original headline", summary: "Summary", translationAttempts: 1 }, new TranslationClientOperationError("provider_request", new Error("HTTP 503")), now, true);
    expect(fallback).toEqual({
      translatedTitle: "Original headline",
      translatedSummary: "Summary",
      translationTranslatedAt: null,
      translationFallback: true,
      translationSkippedReason: "translation_api_error",
      translationError: "HTTP 503",
      translationProvider: "google-cloud-translation",
      translationCharCount: countTranslationCharacters(prepareMarketRssTranslationInput("Original headline").text),
      translationProviderAttempts: 1,
      translationAttempts: 2,
      translationStatus: "FAILED",
      updatedAt: now,
    });
    expect(countMarketRssTranslationFallbackReasons([fallback.translationSkippedReason]))
      .toEqual({ translation_api_error: 1 });
  });

  it("classifies Google daily quota exhaustion as a skipped daily-window fallback, not a transient failure", () => {
    const result = makeMarketRssTranslationFailureFallback(
      { title: "Original headline", summary: "Summary", translationAttempts: 0 },
      new TranslationClientOperationError("provider_request", Object.assign(new Error("HTTP 403 (dailyLimitExceeded)"), { status: 403, providerReason: "dailyLimitExceeded" })),
      new Date("2026-10-01T00:00:00.000Z"),
      true,
    );

    expect(result).toMatchObject({
      translationFallback: true,
      translationSkippedReason: "provider_daily_quota_exceeded",
      translationProvider: "google-cloud-translation",
      translationStatus: "SKIPPED",
      translationAttempts: 1,
    });
    expect(countMarketRssTranslationFallbackReasons([result.translationSkippedReason]))
      .toEqual({ provider_daily_quota_exceeded: 1 });
  });

  it("carries Google's actual 403 dailyLimitExceeded response into the dedicated retryable fallback state", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Quota exceeded", errors: [{ reason: "dailyLimitExceeded" }] },
    }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    let providerError: unknown;
    try {
      await new CloudTranslationClient("test-key").translate("Nvidia revenue rises");
    } catch (error) {
      providerError = error;
    }

    expect(providerError).toMatchObject({ status: 403, providerReason: "dailyLimitExceeded" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const fallback = makeMarketRssTranslationFailureFallback(
      { title: "Nvidia revenue rises", summary: "Company outlook improves", translationAttempts: 0 },
      new TranslationClientOperationError("provider_request", providerError),
      new Date("2026-09-25T06:59:00.000Z"),
      true,
    );
    expect(fallback).toMatchObject({
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "provider_daily_quota_exceeded",
      translationProviderAttempts: 1,
    });

    const afterPacificReset = getMarketRssTranslationRetryCriteria(true, new Date("2026-09-25T07:00:00.001Z"));
    const retryQuery = new PgDialect().sqlToQuery(buildMarketRssTranslationRetryCondition(afterPacificReset)!);
    expect(retryQuery.params).toContain("provider_daily_quota_exceeded");
    expect(retryQuery.params.map((param) => param instanceof Date ? param.toISOString() : String(param)))
      .toContain(getPacificQuotaDayStart(new Date("2026-09-25T07:00:00.001Z")).toISOString());
  });

  it("clears stale provider accounting when failure happened before an API request", () => {
    const result = makeMarketRssTranslationFailureFallback({ title: "Original headline", summary: "Summary", translationAttempts: 0 }, new TranslationClientOperationError("cache_read", new Error("database unavailable")));
    expect(result).toMatchObject({ translationProvider: null, translationCharCount: 0, translationStatus: "FAILED", translationSkippedReason: "translation_preparation_error" });
  });

  it("redacts credentials and bounds provider diagnostics before persistence", () => {
    const error = new Error('Request https://translation.googleapis.com/v2?key=AIzaSyDUMMY012345678901234567890123456789&password=query-password&target=ko failed; token=secret-value Authorization: Bearer bearer-secret\nHTTP 503');
    const result = makeMarketRssTranslationFailureFallback({ title: "Original headline", summary: "Summary", translationAttempts: 0 }, error);

    expect(result.translationError).toContain("[redacted]");
    expect(result.translationError).toContain("HTTP 503");
    expect(result.translationError).not.toContain("AIzaSyDUMMY");
    expect(result.translationError).not.toContain("secret-value");
    expect(result.translationError).not.toContain("query-password");
    expect(result.translationError).not.toContain("bearer-secret");
    expect(result.translationError).toContain("Authorization: [redacted]");
    expect(result.translationError).not.toContain("\n");

    const longResult = makeMarketRssTranslationFailureFallback({ title: "Original headline", summary: "Summary", translationAttempts: 0 }, new Error("x".repeat(1_000)));
    expect(longResult.translationError).toHaveLength(300);
  });

});
