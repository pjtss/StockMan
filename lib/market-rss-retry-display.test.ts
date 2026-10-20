import { describe, expect, it } from "vitest";
import { formatMarketRssTranslationAttemptTime, getMarketRssTranslationAttemptLabel, getMarketRssTranslationRetryDisplay } from "./market-rss-retry-display";

describe("market RSS translation retry display", () => {
  const now = new Date("2026-09-25T00:00:30.000Z");

  it("labels provider calls separately from cache hits and non-provider state checks", () => {
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "cloud_translation_not_configured" })).toBe("번역 설정 확인");
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "SKIPPED", translationSkippedReason: "already_in_target_language" })).toBe("번역 불필요 판정");
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "TRANSLATED" })).toBe("캐시 번역 반영");
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "TRANSLATED", translationProvider: "google-cloud-translation" })).toBe("Google 번역 API 요청");
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "SKIPPED", translationSkippedReason: "monthly_character_limit_reached" })).toBe("한도 확인");
    expect(getMarketRssTranslationAttemptLabel({ translationStatus: "SKIPPED", translationSkippedReason: "provider_daily_quota_exceeded" })).toBe("Google 일일 한도 확인");
  });

  it("shows the first failure backoff and when it is due", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 1, translationAttemptedAt: "2026-09-25T00:00:00.000Z" }, now))
      .toBe("재시도 대기 · 1분 후 (09:01 KST, 1/3)");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 1, translationAttemptedAt: "2026-09-25T00:00:00.000Z" }, new Date("2026-09-25T00:01:00.000Z")))
      .toBe("재시도 가능 (1/3)");
  });

  it("shows incomplete translation output as a retryable quality fallback", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "translation_output_incomplete", translationAttempts: 1, translationAttemptedAt: "2026-09-25T00:00:00.000Z" }, new Date("2026-09-25T00:01:00.000Z")))
      .toBe("재시도 가능 (1/3)");
  });

  it("matches the five-minute second-attempt boundary and flags invalid retry metadata", () => {
    const article = { translationStatus: "FAILED", translationAttempts: 2, translationAttemptedAt: "2026-09-25T00:00:00.000Z" };
    expect(getMarketRssTranslationRetryDisplay(article, new Date("2026-09-25T00:04:59.999Z")))
      .toBe("재시도 대기 · 1분 후 (09:05 KST, 2/3)");
    expect(getMarketRssTranslationRetryDisplay(article, new Date("2026-09-25T00:05:00.000Z")))
      .toBe("재시도 가능 (2/3)");
    expect(getMarketRssTranslationRetryDisplay({ ...article, translationAttemptedAt: "2026-09-25T00:01:00.000Z" }, now))
      .toBe("번역 시도 시각이 미래 · 데이터 확인 필요");
    expect(getMarketRssTranslationRetryDisplay({ ...article, translationAttempts: Number.NaN }, now))
      .toBe("재시도 횟수 데이터 확인 필요");
  });

  it("does not imply automatic retry for failed rows missing a selectable attempt timestamp", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 0 }, now))
      .toBe("재시도 횟수 데이터 확인 필요");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 1 }, now))
      .toBe("재시도 시각 데이터 확인 필요 (1/3)");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 1, translationAttemptedAt: "invalid" }, now))
      .toBe("재시도 시각 데이터 확인 필요 (1/3)");
  });

  it("shows exhausted retries and does not show retry details for other statuses", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "FAILED", translationAttempts: 3, translationAttemptedAt: now }))
      .toBe("자동 재시도 종료 (3/3)");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "TRANSLATED", translationAttempts: 1, translationAttemptedAt: now })).toBeNull();
  });

  it("shows retry timing for retryable skipped fallbacks and month reset timing for quota waits", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "target_language_not_detected", translationAttempts: 1, translationAttemptedAt: "2026-09-25T00:00:00.000Z" }, now))
      .toBe("재시도 대기 · 1분 후 (09:01 KST, 1/3)");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "monthly_character_limit_reached", translationAttempts: 1, translationAttemptedAt: now }, now))
      .toContain("월간 한도 대기");
  });

  it("explains configuration recovery retry and respects invalid or exhausted attempt data", () => {
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "cloud_translation_not_configured", translationAttempts: 0 }))
      .toBe("번역 설정 복구 후 자동 재시도");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "cloud_translation_not_configured", translationAttempts: 3 }))
      .toBe("자동 재시도 종료 (3/3)");
    expect(getMarketRssTranslationRetryDisplay({ translationStatus: "SKIPPED", translationSkippedReason: "cloud_translation_not_configured", translationAttempts: Number.NaN }))
      .toBe("재시도 횟수 데이터 확인 필요");
  });

  it("keeps preparation-stage failures on the ordinary failed-attempt backoff and retry boundary", () => {
    const article = {
      translationStatus: "FAILED",
      translationSkippedReason: "translation_preparation_error",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-25T00:00:00.000Z",
    };
    expect(getMarketRssTranslationRetryDisplay(article, new Date("2026-09-25T00:00:30.000Z")))
      .toBe("재시도 대기 · 1분 후 (09:01 KST, 1/3)");
    expect(getMarketRssTranslationRetryDisplay(article, new Date("2026-09-25T00:01:00.000Z")))
      .toBe("재시도 가능 (1/3)");
  });

  it("shows retry timing and exhaustion for malformed provider response fallbacks", () => {
    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_response_unparseable",
      translationAttempts: 3,
      translationAttemptedAt: now,
    })).toBe("자동 재시도 종료 (3/3)");
  });

  it("waits for the next Pacific midnight after Google daily quota exhaustion and becomes retryable after reset", () => {
    const article = {
      translationStatus: "SKIPPED",
      translationSkippedReason: "provider_daily_quota_exceeded",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-25T00:00:30.000Z",
    };
    expect(getMarketRssTranslationRetryDisplay(article, now))
      .toContain("Google 일일 한도 대기 · 2026. 09. 25. 16:00 KST부터 재시도 가능");
    expect(getMarketRssTranslationRetryDisplay(article, new Date("2026-09-25T07:00:00.001Z")))
      .toBe("Google 일일 한도 해제 · 번역 재시도 가능");
    expect(getMarketRssTranslationRetryDisplay({ ...article, translationAttemptedAt: null }, now))
      .toBe("Google 일일 한도 · 번역 시도 시각 확인 필요");
  });

  it("shows the exact next monthly quota reset in KST and marks older quota fallbacks retryable", () => {
    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-25T00:00:00.000Z",
    }, new Date("2026-09-25T00:00:30.000Z"))).toContain("2026. 10. 01. 09:00 KST부터 재시도 가능");

    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-25T00:00:00.000Z",
    }, new Date("2026-10-01T00:00:00.000Z"))).toBe("월간 한도 해제 · 번역 재시도 가능");
  });

  it("handles UTC year rollover and refuses to guess when attempt timestamps are missing or in the future", () => {
    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
      translationAttemptedAt: "2026-12-31T14:00:00.000Z",
    }, new Date("2026-12-31T14:59:59.000Z"))).toContain("2027. 01. 01. 09:00 KST");

    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
    }, now)).toBe("월간 한도 · 번역 시도 시각 확인 필요");
    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
      translationAttemptedAt: "2026-09-25T00:01:00.000Z",
    }, now)).toBe("월간 한도 · 미래 시각 데이터 확인 필요");
    expect(getMarketRssTranslationRetryDisplay({
      translationStatus: "SKIPPED",
      translationSkippedReason: "monthly_character_limit_reached",
      translationAttemptedAt: "2026-10-02T00:00:00.000Z",
    }, new Date("2026-09-25T00:00:00.000Z"))).toBe("월간 한도 · 미래 시각 데이터 확인 필요");
  });

  it("formats valid attempt timestamps in KST and rejects invalid timestamps", () => {
    expect(formatMarketRssTranslationAttemptTime("2026-09-25T00:00:00.000Z")).toContain("9:00:00");
    expect(formatMarketRssTranslationAttemptTime("not-a-date")).toBeNull();
    expect(formatMarketRssTranslationAttemptTime(null)).toBeNull();
  });
});
