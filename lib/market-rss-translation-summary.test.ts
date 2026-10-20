import { describe, expect, it } from "vitest";
import { getMarketRssFallbackArticles, summarizeMarketRssTranslationResults } from "./market-rss-translation-summary";

describe("market RSS translation result summary", () => {
  it("summarizes translated and fallback articles across the all-sources response shape", () => {
    expect(summarizeMarketRssTranslationResults({
      translationConfiguration: { requested: true },
      results: [
        { ok: true, feed: { items: [
          { title: "Growth 20%", translatedTitle: "성장 20%", translationFallback: false },
          { title: "Already Korean", translatedTitle: "Already Korean", translationFallback: false },
          { title: "삼성전자 실적 증가", translatedTitle: "삼성전자 실적 증가", translationFallback: false, translationNotRequired: true },
          { title: "Quota", translatedTitle: "Quota", translationFallback: true, translationFallbackReason: "monthly_character_limit_reached" },
        ] } },
        { ok: false, error: "feed unavailable" },
      ],
    })).toEqual({
      articleCount: 4,
      translatedCount: 2,
      notRequiredCount: 1,
      fallbackCount: 1,
      unchangedCount: 1,
      fallbackReasons: { monthly_character_limit_reached: 1 },
    });
  });

  it("supports the single-source preview response and keeps item-level API errors visible", () => {
    expect(summarizeMarketRssTranslationResults({
      translationConfiguration: { requested: true },
      feed: { items: [{ title: "Headline", translatedTitle: "Headline", translationFallback: true, translationFallbackReason: "translation_api_error" }] },
    })).toMatchObject({ articleCount: 1, translatedCount: 0, fallbackCount: 1, fallbackReasons: { translation_api_error: 1 } });
  });

  it("does not present translation metrics when translation was not requested", () => {
    expect(summarizeMarketRssTranslationResults({ translationConfiguration: { requested: false }, feed: { items: [] } })).toBeNull();
  });

  it("filters fallback articles by reason and preserves links and original/translated titles", () => {
    const result = {
      translationConfiguration: { requested: true },
      feed: { items: [
        { source: "NASDAQ", externalId: "quota-1", title: "Original quota", translatedTitle: "Original quota", link: "https://example.com/quota", translationFallback: true, translationFallbackReason: "monthly_character_limit_reached" },
        { source: "SEC_EDGAR", externalId: "api-1", title: "Original api", translatedTitle: "Original api", link: "https://example.com/api", translationFallback: true, translationFallbackReason: "translation_api_error" },
      ] },
    };
    expect(getMarketRssFallbackArticles(result, "monthly_character_limit_reached")).toEqual([{
      source: "NASDAQ", externalId: "quota-1", title: "Original quota", translatedTitle: "Original quota", link: "https://example.com/quota", reason: "monthly_character_limit_reached",
    }]);
    expect(getMarketRssFallbackArticles(result)).toHaveLength(2);
  });
});
