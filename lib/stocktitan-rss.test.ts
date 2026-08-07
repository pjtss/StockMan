import { describe, expect, it, vi } from "vitest";
import { fetchStockTitanRss, STOCKTITAN_RSS_URL, stockTitanRssConfig } from "./stocktitan-rss";

describe("StockTitan RSS", () => {
  it("uses the official feed URL by default", () => {
    vi.stubEnv("STOCKTITAN_RSS_URL", "");
    expect(stockTitanRssConfig()).toMatchObject({ source: "STOCKTITAN", url: STOCKTITAN_RSS_URL, configuredUrl: false });
  });

  it("parses the publisher-provided feed through the common RSS parser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`<?xml version="1.0"?><rss version="2.0"><channel><item><guid>st-1</guid><title>Example raises outlook</title><link>https://example.com/a</link><pubDate>Fri, 07 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } })));
    const result = await fetchStockTitanRss();
    expect(result.source).toBe("STOCKTITAN");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "st-1", title: "Example raises outlook" });
  });
});
