import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { fetchMarketRss, parseMarketRss } from "./market-rss";
describe("market RSS", () => {
  it("parses RSS and Atom items through one contract", () => {
    expect(parseMarketRss(`<rss><channel><item><guid>a</guid><title>Alpha</title><link>https://example.com/a</link><pubDate>2026-01-01T00:00:00Z</pubDate></item></channel></rss>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "a", title: "Alpha", link: "https://example.com/a", source: "TEST" });
    expect(parseMarketRss(`<feed><entry><id>b</id><title>Beta</title><link href="https://example.com/b"/><updated>2026-01-02T00:00:00Z</updated></entry></feed>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "b", title: "Beta", link: "https://example.com/b" });
  });

  it("rejects HTML and malformed XML instead of treating them as a successful empty feed", () => {
    expect(() => parseMarketRss("<html><body>GlobeNewswire</body></html>", "GLOBENEWSWIRE", "https://example.com"))
      .toThrow(/RSS 또는 Atom feed가 아닙니다/);
    expect(() => parseMarketRss("<rss><channel>", "TEST", "https://example.com"))
      .toThrow(/올바른 XML이 아닙니다/);
  });

  it("rejects an HTTP 200 HTML response from a feed endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><body>site</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));
    try {
      await expect(fetchMarketRss("GLOBENEWSWIRE", "https://example.com"))
        .rejects.toThrow(/RSS 또는 Atom feed가 아닙니다/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("decodes only XML-standard references in extracted headline, context, ID, and link while preserving raw payload text", () => {
    const xml = '<rss><channel><item><guid>AT&amp;T&#x2D;Q3</guid><title>AT&amp;T&#160;Q3 &amp; outlook</title><link>https://example.com/story?a=1&amp;b=2</link><description><![CDATA[Revenue &amp; outlook]]></description></item></channel></rss>';
    const parsed = parseMarketRss(xml, "TEST", "https://example.com/feed");

    expect(parsed.items[0]).toMatchObject({
      id: "AT&T-Q3",
      title: "AT&T Q3 & outlook",
      link: "https://example.com/story?a=1&b=2",
      summary: "Revenue & outlook",
    });
    expect(parsed.items[0].raw).toMatchObject({ title: "AT&amp;T&#160;Q3 &amp; outlook" });
  });

  it("does not expand custom DTD entities when parsing RSS text", () => {
    const parsed = parseMarketRss('<!DOCTYPE rss [<!ENTITY custom "expanded">]><rss><channel><item><title>&custom; revenue</title></item></channel></rss>', "TEST", "https://example.com/feed");
    expect(parsed.items[0].title).toBe("&custom; revenue");
  });

  it("decodes XML references in Atom link attributes", () => {
    const parsed = parseMarketRss('<feed><entry><id>story-1</id><title>Company outlook</title><link href="https://example.com/story?a=1&amp;b=2"/><updated>2026-09-26T00:00:00Z</updated></entry></feed>', "TEST", "https://example.com/feed");
    expect(parsed.items[0].link).toBe("https://example.com/story?a=1&b=2");
  });

  it("fails a hung feed with a bounded timeout", async () => {
    vi.stubEnv("RSS_FETCH_TIMEOUT_MS", "1000");
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    await expect(fetchMarketRss("TEST", "https://example.com")).rejects.toThrow("시간 초과");
    vi.unstubAllGlobals();
  });
});
