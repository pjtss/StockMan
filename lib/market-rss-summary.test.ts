import { describe, expect, it } from "vitest";
import { extractMarketRssCoreSummary } from "./market-rss-summary";
import { parseMarketRss } from "./market-rss";

describe("extractMarketRssCoreSummary", () => {
  it("extracts concise readable text from HTML and decodes HTML entities", () => {
    const result = extractMarketRssCoreSummary("<p>Company&apos;s revenue rose &amp; earnings improved.</p><p>Shares climbed 12%.<br>About the Company: Long boilerplate.</p>");
    expect(result).toBe("Company's revenue rose & earnings improved. Shares climbed 12%.");
    expect(result).not.toMatch(/<[^>]+>|&(?:amp|nbsp|apos);/i);
  });

  it("removes a GlobeNewswire dateline and a StockTitan SEO suffix from the normalized value", () => {
    expect(extractMarketRssCoreSummary("NEW YORK, Oct. 27, 2026 (GLOBE NEWSWIRE) -- Example Corp. reported revenue growth."))
      .toBe("Example Corp. reported revenue growth.");
    expect(extractMarketRssCoreSummary("<p align=\"justify\">NEW YORK, Oct.  27, 2026  (GLOBE NEWSWIRE) -- Cellectis reported strong results.</p>"))
      .toBe("Cellectis reported strong results.");
    expect(extractMarketRssCoreSummary("", "Company announces a deal | SEKEY Stock News"))
      .toBe("Company announces a deal");
  });

  it("drops script/style markup and keeps at most three sentences", () => {
    const result = extractMarketRssCoreSummary("<style>.x{}</style><p>First sentence. Second sentence. Third sentence. Fourth sentence.</p><script>ignore()</script>");
    expect(result).toBe("First sentence. Second sentence. Third sentence.");
  });

  it("returns empty text for absent summaries and boilerplate-only values", () => {
    expect(extractMarketRssCoreSummary("")).toBe("");
    expect(extractMarketRssCoreSummary("<p>About the Company: Example Corp.</p>")).toBe("");
  });

  it("uses the feed headline when the publisher has no prose summary", () => {
    expect(extractMarketRssCoreSummary("", "Company reports quarterly revenue"))
      .toBe("Company reports quarterly revenue");
    expect(extractMarketRssCoreSummary("Filed: 2026-10-26 AccNo: 0000000000 Size: 20 KB", "8-K - Example Corp"))
      .toBe("8-K - Example Corp");
    expect(extractMarketRssCoreSummary("<b>Filed:</b> 2026-09-03 <b>AccNo:</b> 0000753308-26-000071 <b>Size:</b> 915 KB <br>Item 5.07: Submission of Matters to a Vote of Security Holders", "8-K - NEXTERA ENERGY INC (0000753308) (Filer)"))
      .toBe("8-K - NEXTERA ENERGY INC (0000753308) (Filer)");
    expect(extractMarketRssCoreSummary("News Category Alert Markets What You Need To Know Trader Alerts - new release", "Trader alert headline"))
      .toBe("Trader alert headline");
    expect(extractMarketRssCoreSummary("<table><tr><th>News Category</th><th>Alert</th><th>Markets</th><th>What You Need To Know</th></tr><tr><td>Trader Alerts</td><td>New ETP Listings</td></tr></table>", "Trader alert headline"))
      .toBe("Trader alert headline");
  });

  it("does not split decimal figures as sentence boundaries", () => {
    expect(extractMarketRssCoreSummary("Income reached 2. 26 billion. Shares rose 3%. Outlook is stable."))
      .toBe("Income reached 2.26 billion. Shares rose 3%. Outlook is stable.");
  });

  it("keeps the source summary unchanged and adds a separate normalized value", () => {
    const feed = parseMarketRss("<rss><channel><item><title>Revenue update</title><description><![CDATA[<p>Revenue increased 18%.</p>]]></description></item></channel></rss>", "TEST", "https://example.com/feed");
    expect(feed.items[0].summary).toBe("<p>Revenue increased 18%.</p>");
    expect(feed.items[0].normalizedSummary).toBe("Revenue increased 18%.");
  });
});
