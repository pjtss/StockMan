import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/market-rss-translation-review.json";
import { prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { MARKET_RSS_TRANSLATION_CONTEXT_MARKER, MARKET_RSS_TRANSLATION_HEADLINE_MARKER } from "./market-rss-translation-input";
import { protectMarketRssTranslationTokens } from "./market-rss-translation-protection";
import { translateMarketRssItem } from "./translate-market-rss-item";
import type { TranslationReviewFixture } from "../scripts/market-rss-translation-review-import.mjs";

const reviewFixture = fixture as TranslationReviewFixture;
if (reviewFixture.cases.length === 0) {
  console.warn("[translation-review] semantic regression coverage skipped: no human-approved cases in lib/fixtures/market-rss-translation-review.json");
}

describe("human-reviewed market RSS translation regression fixtures", () => {
  it("uses a supported schema and unique stable case identifiers", () => {
    expect(reviewFixture.schemaVersion).toBe(1);
    const ids = reviewFixture.cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of reviewFixture.cases) {
      expect(entry.id).toMatch(/^[a-f0-9]{20}$/);
      expect(entry.originalTitle.trim()).not.toBe("");
      expect(entry.translatedTitle.trim()).not.toBe("");
      expect(entry.expectedTitle.trim()).not.toBe("");
      expect(["정확", "자동검사 오탐 확인", "부분번역", "오역"]).toContain(entry.verdict);
      if (entry.verdict === "정확" || entry.verdict === "자동검사 오탐 확인") expect(entry.expectedTitle, entry.id).toBe(entry.translatedTitle);
      else expect(entry.expectedTitle, entry.id).not.toBe(entry.translatedTitle);
    }
  });
});

const semanticCoverageSuite = reviewFixture.cases.length === 0 ? describe.skip : describe;

semanticCoverageSuite("human-reviewed market RSS semantic regression coverage", () => {
  it("keeps every protected source number and ticker exactly once in the reviewed expected title", () => {
    for (const entry of reviewFixture.cases) {
      const protectedInput = protectMarketRssTranslationTokens(entry.originalTitle);
      for (const token of protectedInput.placeholders) {
        expect(entry.expectedTitle.split(token.original).length - 1, `${entry.id}: ${token.original}`).toBe(1);
      }
    }
  });

  it("checks reviewed expected-title plumbing through shared RSS input and fallback handling (not provider accuracy)", async () => {
    for (const entry of reviewFixture.cases) {
      const prepared = prepareMarketRssTranslationInput(entry.originalTitle, entry.originalSummary || "");
      let providerHeadline = entry.expectedTitle;
      for (const token of prepared.placeholders) {
        providerHeadline = providerHeadline.replace(token.original, token.marker);
      }
      const providerContext = prepared.hasContext
        ? prepared.text.split(MARKET_RSS_TRANSLATION_CONTEXT_MARKER)[1]?.replace(/<\/p><\/div>$/, "") || ""
        : "";
      const providerOutput = prepared.hasContext
        ? `<div>${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}${providerHeadline}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}${providerContext}</p></div>`
        : providerHeadline;
      const translate = vi.fn(async () => ({
        translatedText: providerOutput,
        source: "en" as const,
        target: "ko" as const,
        provider: "reviewed-fixture",
        fallback: false,
      }));
      const result = await translateMarketRssItem({
        id: entry.id,
        title: entry.originalTitle,
        summary: entry.originalSummary || "",
        link: entry.link || "",
        publishedAt: entry.publishedAt,
        source: entry.source,
      }, { translate });

      expect(translate).toHaveBeenCalledWith(prepared.text, "auto", "ko", prepared.format);
      expect(result.translatedTitle, entry.id).toBe(entry.expectedTitle);
      expect(result.translationFallback, entry.id).toBe(false);
    }
  });
});
