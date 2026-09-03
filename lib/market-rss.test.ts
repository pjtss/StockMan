import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { fetchMarketRss, parseMarketRss } from "./market-rss";
describe("market RSS", () => {
  it("parses RSS and Atom items through one contract", () => {
    expect(parseMarketRss(`<rss><channel><item><guid>a</guid><title>Alpha</title><link>https://example.com/a</link><pubDate>2026-01-01T00:00:00Z</pubDate></item></channel></rss>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "a", title: "Alpha", link: "https://example.com/a", source: "TEST" });
    expect(parseMarketRss(`<feed><entry><id>b</id><title>Beta</title><link href="https://example.com/b"/><updated>2026-01-02T00:00:00Z</updated></entry></feed>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "b", title: "Beta", link: "https://example.com/b" });
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
