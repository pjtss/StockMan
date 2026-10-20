import { describe, expect, it } from "vitest";
import { getMarketRssTranslationDisplay } from "./market-rss-translation-label";

const base = { translationStatus: "PENDING", translationFallback: false, notifyEligible: true, isBacklog: false };

describe("market RSS translation status labels", () => {
  it("distinguishes missing configuration, quota fallback, and provider error", () => {
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "cloud_translation_not_configured" }).label)
      .toContain("설정 누락");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "monthly_character_limit_reached" }).label)
      .toContain("월간 한도");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "protected_token_mismatch" }).label)
      .toContain("티커");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "target_language_not_detected" }).label)
      .toContain("한국어 번역 결과");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "translation_response_unparseable" }).label)
      .toContain("응답 형식 확인 실패");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "translation_input_empty" }).label)
      .toContain("RSS 제목 내용 없음");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "translation_api_error", translationError: "HTTP 503" }).label)
      .toBe("원문 fallback · 공급자 오류");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "translation_api_error", translationError: "token=secret-value" }).label)
      .not.toContain("secret-value");
  });

  it("does not label excluded or backlog RSS rows as translation failures", () => {
    expect(getMarketRssTranslationDisplay({ ...base, notifyEligible: false }).tone).toBe("translationMuted");
    expect(getMarketRssTranslationDisplay({ ...base, isBacklog: true }).label).toContain("과거 기사");
  });

  it("uses clear labels for translated, failed, skipped, and pending states", () => {
    expect(getMarketRssTranslationDisplay({ ...base, translationStatus: "TRANSLATED" }).label).toBe("번역 완료");
    expect(getMarketRssTranslationDisplay({ ...base, translationStatus: "FAILED" }).tone).toBe("translationError");
    expect(getMarketRssTranslationDisplay({ ...base, translationStatus: "SKIPPED" }).tone).toBe("translationWarning");
    expect(getMarketRssTranslationDisplay(base).label).toBe("번역 대기");
  });

  it("labels a Korean source headline as not requiring translation", () => {
    expect(getMarketRssTranslationDisplay({ ...base, translationStatus: "SKIPPED", translationSkippedReason: "already_in_target_language" }).label)
      .toBe("번역 불필요 · 이미 한국어");
  });

  it("marks an unchanged provider result for review using normalized Korean text", () => {
    expect(getMarketRssTranslationDisplay({
      ...base,
      title: "매출 20% 증가",
      translatedTitle: "매출   20% 증가",
      translationStatus: "TRANSLATED",
    })).toEqual({ label: "번역 결과가 원문과 동일 · 검토 필요", tone: "translationWarning" });
  });

  it("provides user-facing Korean fallback labels suitable for Discord notifications", () => {
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "cloud_translation_not_configured" }).label)
      .toBe("원문 fallback · 번역 설정 누락");
    expect(getMarketRssTranslationDisplay({ ...base, translationFallback: true, translationSkippedReason: "monthly_character_limit_reached" }).label)
      .toBe("원문 fallback · 월간 한도 도달");
  });

  it("uses the same exact retry timing and exhaustion state as the admin retry display", () => {
    expect(getMarketRssTranslationDisplay({
      ...base,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_output_incomplete",
      translationAttempts: 1,
      translationAttemptedAt: "2026-09-25T00:00:00.000Z",
    }, new Date("2026-09-25T00:00:30.000Z")).label).toContain("재시도 가능 (1/3)");
    expect(getMarketRssTranslationDisplay({
      ...base,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_output_incomplete",
      translationAttempts: 3,
      translationAttemptedAt: "2026-09-25T00:00:00.000Z",
    })).toMatchObject({ label: expect.stringContaining("자동 재시도 종료 (3/3)"), tone: "translationError" });
    expect(getMarketRssTranslationDisplay({
      ...base,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "cloud_translation_not_configured",
      translationAttempts: 3,
    }).label).toContain("자동 재시도 종료 (3/3)");
  });

});
