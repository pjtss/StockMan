import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ORIGINAL_RSS_FEEDS, fetchOriginalRssFeed, OriginalRssHttpError } from "./feed-source.mjs";

const stockTitanXml = `<?xml version="1.0"?><rss version="2.0"><channel><item><guid>st-1</guid><title>StockTitan headline</title><link>https://www.stocktitan.net/news/X/test.html</link><pubDate>Sat, 26 Sep 2026 01:00:00 GMT</pubDate><description>summary</description></item></channel></rss>`;
const secAtomXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://www.sec.gov/Archives/edgar/data/1/000000000026000001/</id><title>8-K - Example Corp. (0000000001)</title><link href="https://www.sec.gov/Archives/edgar/data/1/000000000026000001/"/><updated>2026-09-26T01:00:00Z</updated><summary>Example filing</summary></entry></feed>`;

describe("local RSS original feed source module", () => {
  it("defines only the publisher StockTitan and SEC EDGAR feed origins", () => {
    expect(DEFAULT_ORIGINAL_RSS_FEEDS.map((feed) => new URL(feed.url).hostname)).toEqual(["www.stocktitan.net", "www.sec.gov"]);
  });

  it("fetches and parses the original StockTitan RSS feed directly", async () => {
    const fetchImpl = vi.fn(async () => new Response(stockTitanXml, { status: 200 }));
    const result = await fetchOriginalRssFeed(DEFAULT_ORIGINAL_RSS_FEEDS[0], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(DEFAULT_ORIGINAL_RSS_FEEDS[0].url, expect.objectContaining({ method: "GET", cache: "no-store" }));
    expect(result).toMatchObject({ source: "STOCKTITAN", responseStatus: 200, items: [{ id: "st-1", title: "StockTitan headline" }] });
  });

  it("sends SEC_USER_AGENT and parses SEC Atom entries", async () => {
    const fetchImpl = vi.fn(async () => new Response(secAtomXml, { status: 200 }));
    const result = await fetchOriginalRssFeed(DEFAULT_ORIGINAL_RSS_FEEDS[1], { fetchImpl, userAgent: "StockMan test test@example.com" });
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ "user-agent": "StockMan test test@example.com" });
    expect(result).toMatchObject({ source: "SEC_EDGAR", items: [{ title: "8-K - Example Corp. (0000000001)", link: "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/" }] });
  });

  it("rejects missing SEC identity, non-source hosts, HTTP and non-XML responses", async () => {
    await expect(fetchOriginalRssFeed(DEFAULT_ORIGINAL_RSS_FEEDS[1], { fetchImpl: vi.fn(), userAgent: "" })).rejects.toThrow("SEC_USER_AGENT");
    await expect(fetchOriginalRssFeed({ source: "STOCKTITAN", url: "https://example.com/feed" })).rejects.toThrow("허용 도메인");
    await expect(fetchOriginalRssFeed({ source: "STOCKTITAN", url: "http://www.stocktitan.net/rss" })).rejects.toThrow("HTTPS");
    await expect(fetchOriginalRssFeed(DEFAULT_ORIGINAL_RSS_FEEDS[0], { fetchImpl: vi.fn(async () => new Response("<html>blocked</html>")) })).rejects.toThrow("RSS/Atom XML");
  });

  it("preserves Retry-After metadata on HTTP 429 without treating it as an empty feed", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429, headers: { "retry-after": "23" } }));
    await expect(fetchOriginalRssFeed(DEFAULT_ORIGINAL_RSS_FEEDS[0], { fetchImpl })).rejects.toMatchObject<Partial<OriginalRssHttpError>>({
      name: "OriginalRssHttpError", source: "STOCKTITAN", status: 429, retryAfter: "23",
    });
  });
});
