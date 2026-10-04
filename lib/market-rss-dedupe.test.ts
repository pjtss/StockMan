import { describe, expect, it } from "vitest";
import { dedupeMarketRssItems } from "./market-rss-dedupe";
import type { MarketRssItem } from "./market-rss";

const item = (id: string, source = "NASDAQ", title = id): MarketRssItem => ({
  id, source, title, summary: "", link: "", publishedAt: null,
});

describe("dedupeMarketRssItems", () => {
  it("keeps the first item per database conflict key", () => {
    const result = dedupeMarketRssItems([
      item("same", "NASDAQ", "newest"),
      item("other"),
      item("same", "NASDAQ", "duplicate"),
      item("same", "SEC_EDGAR", "different source"),
    ]);

    expect(result.items.map(({ source, id, title }) => [source, id, title])).toEqual([
      ["NASDAQ", "same", "newest"],
      ["NASDAQ", "other", "other"],
      ["SEC_EDGAR", "same", "different source"],
    ]);
    expect(result.duplicateCount).toBe(1);
  });

  it("does not collapse distinct identifiers", () => {
    expect(dedupeMarketRssItems([item("a"), item("b")])).toMatchObject({ duplicateCount: 0 });
  });

  it("canonicalizes ids as PostgreSQL TEXT conflict keys", () => {
    const numericId = item("42");
    (numericId as unknown as { id: unknown }).id = 42;
    const result = dedupeMarketRssItems([numericId, item("42")]);
    expect(result.items).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });
});
