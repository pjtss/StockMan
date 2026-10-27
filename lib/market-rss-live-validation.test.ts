import { describe, expect, it } from "vitest";
import { fetchAllMarketRss } from "./market-rss-sources";
import { MARKET_RSS_SOURCES } from "./market-rss-sources";

const liveValidationEnabled = process.env.RUN_MARKET_RSS_LIVE_VALIDATION === "1";

describe.skipIf(!liveValidationEnabled)("live US RSS normalized summary validation", () => {
  it("fetches every configured publisher feed and validates extracted summary text", async () => {
    const fetched = await fetchAllMarketRss();
    expect(fetched.results.map((result) => result.source).sort()).toEqual([...MARKET_RSS_SOURCES].sort());

    let totalItems = 0;
    for (const result of fetched.results) {
      expect(result.ok, `${result.source}: feed fetch must succeed`).toBe(true);
      if (!result.ok) continue;
      const items = result.feed.items;
      totalItems += items.length;
      const withSourceText = items.filter((item) => item.summary.trim().length > 0);
      const extracted = items.filter((item) => Boolean(item.normalizedSummary?.trim()));
      const fromHeadline = items.filter((item) => !item.summary.trim() || item.normalizedSummary?.trim() === item.title.trim());
      const hasMarkup = extracted.filter((item) => /<\/?[a-z][^>]*>/i.test(item.normalizedSummary || ""));
      const hasEncodedEntities = extracted.filter((item) => /&(?:amp|nbsp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/i.test(item.normalizedSummary || ""));

      console.log(JSON.stringify({
        source: result.source,
        feedItems: items.length,
        sourceTextItems: withSourceText.length,
        extractedItems: extracted.length,
        extractedFromSourceSummary: withSourceText.length - fromHeadline.filter((item) => item.summary.trim()).length,
        headlineFallbackItems: fromHeadline.length,
        extractionRate: items.length ? Number((extracted.length / items.length).toFixed(4)) : null,
        markupRemains: hasMarkup.length,
        encodedEntitiesRemain: hasEncodedEntities.length,
        emptySourceTextItems: items.length - withSourceText.length,
        sample: extracted[0] ? { title: extracted[0].title.slice(0, 100), sourceSummary: extracted[0].summary.slice(0, 180), normalizedSummary: extracted[0].normalizedSummary?.slice(0, 180) ?? "" } : null,
      }));

      expect(items.length, `${result.source}: RSS item count`).toBeGreaterThan(0);
      expect(extracted.length, `${result.source}: every RSS item must yield extracted core text from summary or title`).toBe(items.length);
      expect(hasMarkup, `${result.source}: normalized text must not contain HTML tags`).toHaveLength(0);
      expect(hasEncodedEntities, `${result.source}: normalized text must not contain encoded HTML/XML entities`).toHaveLength(0);
    }
    console.log(JSON.stringify({ totalItems, sourceCount: fetched.results.length, fetchedAt: fetched.fetchedAt }));
    expect(totalItems).toBeGreaterThan(0);
  }, 120_000);
});
