import { describe, expect, it } from "vitest";
import { getMarketRssTranslationReasonDisplay, MARKET_RSS_TRANSLATION_FALLBACK_REASONS } from "./market-rss-translation-reason";

describe("market RSS translation fallback reason catalog", () => {
  it("provides localized long/short labels and tones for every known fallback reason", () => {
    const reasons = [
      "cloud_translation_not_configured",
      "monthly_character_limit_reached",
      "provider_daily_quota_exceeded",
      "protected_token_mismatch",
      "translation_numeric_hallucination",
      "target_language_not_detected",
      "translation_output_incomplete",
      "translation_response_unparseable",
      "translation_cache_invalidation_failed",
      "translation_input_empty",
      "translation_preparation_error",
      "translation_api_error",
      "unknown",
    ];

    expect(Object.keys(MARKET_RSS_TRANSLATION_FALLBACK_REASONS)).toEqual(reasons);
    for (const reason of reasons) {
      const display = getMarketRssTranslationReasonDisplay(reason);
      expect(display.label.trim()).not.toBe("");
      expect(display.shortLabel.trim()).not.toBe("");
      expect(display.operatorAction.trim()).not.toBe("");
      expect(["translationWarning", "translationError"]).toContain(display.tone);
      expect(display.label).not.toContain(reason);
      expect(display.shortLabel).not.toContain(reason);
    }
  });

  it("uses the safe unknown label for empty and future reason codes", () => {
    expect(getMarketRssTranslationReasonDisplay(null)).toEqual(MARKET_RSS_TRANSLATION_FALLBACK_REASONS.unknown);
    expect(getMarketRssTranslationReasonDisplay("future_internal_code")).toEqual(MARKET_RSS_TRANSLATION_FALLBACK_REASONS.unknown);
  });
});
