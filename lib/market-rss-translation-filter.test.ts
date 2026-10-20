import { describe, expect, it } from "vitest";
import { matchesMarketRssTranslationFilter } from "./market-rss-translation-filter";
import { getMarketRssTranslationRetryState } from "./market-rss-retry-display";

describe("market RSS translation filter", () => {
  it("includes fallback rows independently of their terminal translation status", () => {
    expect(matchesMarketRssTranslationFilter({ translationStatus: "FAILED", translationFallback: true }, "FALLBACK")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "SKIPPED", translationFallback: true }, "FALLBACK")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "TRANSLATED", translationFallback: false }, "FALLBACK")).toBe(false);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "FAILED", translationFallback: true }, "FALLBACK")).toBe(true);
  });

  it("includes failed fallback rows in the FAILED filter while keeping FALLBACK broader", () => {
    expect(matchesMarketRssTranslationFilter({ translationStatus: "FAILED", translationFallback: true }, "FAILED")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "FAILED", translationFallback: false }, "FAILED")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "SKIPPED", translationFallback: true }, "FAILED")).toBe(false);
  });

  it("matches pending and translated states and leaves all rows visible for all", () => {
    expect(matchesMarketRssTranslationFilter({ translationStatus: "PENDING", translationFallback: false }, "PENDING")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "TRANSLATED", translationFallback: false }, "TRANSLATED")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "SKIPPED", translationFallback: true }, "all")).toBe(true);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "SKIPPED", translationFallback: false }, "NOT_REQUIRED")).toBe(true);
  });

  it("shows exactly provider translations and retained quality candidates in the review filter", () => {
    const providerTranslation = { translationStatus: "TRANSLATED", translationFallback: false, translatedTitle: "매출 증가" };
    const qualityCandidate = { translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "translation_numeric_hallucination", translationCandidateTitle: "매출 25% 증가" };
    const unrelatedFallback = { translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error" };
    const koreanTitle = { translationStatus: "SKIPPED", translationFallback: false, translationSkippedReason: "already_in_target_language" };

    expect(matchesMarketRssTranslationFilter(providerTranslation, "REVIEW")).toBe(true);
    expect(matchesMarketRssTranslationFilter(qualityCandidate, "REVIEW")).toBe(true);
    expect(matchesMarketRssTranslationFilter(unrelatedFallback, "REVIEW")).toBe(false);
    expect(matchesMarketRssTranslationFilter(koreanTitle, "REVIEW")).toBe(false);
    expect(matchesMarketRssTranslationFilter({ translationStatus: "PENDING", translationFallback: false }, "REVIEW")).toBe(false);
  });

  it("includes only rows whose shared retry policy says retry is currently available", () => {
    const now = new Date("2026-09-26T00:02:00.000Z");
    const due = { translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error", translationAttempts: 1, translationAttemptedAt: "2026-09-26T00:00:00.000Z" };
    const waiting = { ...due, translationAttemptedAt: "2026-09-26T00:01:30.000Z" };
    const exhausted = { ...due, translationAttempts: 3 };

    expect(matchesMarketRssTranslationFilter(due, "RETRY_READY", now)).toBe(true);
    expect(matchesMarketRssTranslationFilter(waiting, "RETRY_READY", now)).toBe(false);
    expect(matchesMarketRssTranslationFilter(exhausted, "RETRY_READY", now)).toBe(false);
    expect(matchesMarketRssTranslationFilter({ ...due, translationAttemptedAt: "2026-09-26T00:03:00.000Z" }, "RETRY_READY", now)).toBe(false);
    expect(matchesMarketRssTranslationFilter({ ...due, translationAttempts: Number.NaN }, "RETRY_READY", now)).toBe(false);
    expect(matchesMarketRssTranslationFilter({ ...due, translationAttemptedAt: "not-a-date" }, "RETRY_READY", now)).toBe(false);
    const monthlyQuota = { ...due, translationStatus: "SKIPPED", translationSkippedReason: "monthly_character_limit_reached" };
    expect(matchesMarketRssTranslationFilter(monthlyQuota, "RETRY_READY", now)).toBe(false);
    expect(matchesMarketRssTranslationFilter({ ...monthlyQuota, translationAttemptedAt: "2026-09-30T23:59:59.999Z" }, "RETRY_READY", new Date("2026-10-01T00:00:00.000Z"))).toBe(true);
    const providerDailyQuota = { ...due, translationStatus: "SKIPPED", translationSkippedReason: "provider_daily_quota_exceeded", translationAttemptedAt: "2026-09-25T00:00:30.000Z" };
    expect(matchesMarketRssTranslationFilter(providerDailyQuota, "RETRY_READY", new Date("2026-09-25T00:01:00.000Z"))).toBe(false);
    expect(matchesMarketRssTranslationFilter(providerDailyQuota, "RETRY_READY", new Date("2026-09-25T07:00:00.001Z"))).toBe(true);
  });

  it("keeps incomplete-translation display wording independent from retry-ready filtering", () => {
    const due = {
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_output_incomplete",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-26T00:00:00.000Z",
    };
    const now = new Date("2026-09-26T00:01:00.000Z");
    const retryState = getMarketRssTranslationRetryState(due, now);

    expect(retryState).toEqual({ display: "재시도 가능 (1/3)", retryReady: true });
    expect(matchesMarketRssTranslationFilter(due, "RETRY_READY", now)).toBe(true);
    expect(matchesMarketRssTranslationFilter({ ...due, translationAttemptedAt: "2026-09-26T00:00:30.000Z" }, "RETRY_READY", now)).toBe(false);
  });
});
