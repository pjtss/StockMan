import { describe, expect, it } from "vitest";
import { getMarketNewsKoreanTitle } from "./market-news-korean-title";

describe("getMarketNewsKoreanTitle", () => {
  it("returns a validated provider translation", () => {
    expect(getMarketNewsKoreanTitle({
      translatedTitle: "매출 증가",
      translationStatus: "TRANSLATED",
      translationSkippedReason: null,
      translationFallback: false,
    })).toBe("매출 증가");
  });

  it("returns a Korean source title marked as already in the target language", () => {
    expect(getMarketNewsKoreanTitle({
      translatedTitle: "삼성전자 실적 발표",
      translationStatus: "SKIPPED",
      translationSkippedReason: "already_in_target_language",
      translationFallback: false,
    })).toBe("삼성전자 실적 발표");
  });

  it.each([
    { translationStatus: "SKIPPED", translationSkippedReason: "monthly_character_limit_reached", translationFallback: true },
    { translationStatus: "FAILED", translationSkippedReason: "translation_api_error", translationFallback: true },
    { translationStatus: "PENDING", translationSkippedReason: null, translationFallback: false },
    { translationStatus: "TRANSLATED", translationSkippedReason: null, translationFallback: true },
  ])("does not expose an untranslated fallback as Korean (%o)", (state) => {
    expect(getMarketNewsKoreanTitle({ translatedTitle: "Revenue rises", ...state })).toBeNull();
  });

  it("rejects an empty translated title", () => {
    expect(getMarketNewsKoreanTitle({
      translatedTitle: "   ",
      translationStatus: "TRANSLATED",
      translationSkippedReason: null,
      translationFallback: false,
    })).toBeNull();
  });
});
