import { describe, expect, it } from "vitest";
import { parseMarketRss } from "./market-rss";
describe("market RSS", () => {
  it("parses RSS and Atom items through one contract", () => {
    expect(parseMarketRss(`<rss><channel><item><guid>a</guid><title>Alpha</title><link>https://example.com/a</link><pubDate>2026-01-01T00:00:00Z</pubDate></item></channel></rss>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "a", title: "Alpha", link: "https://example.com/a", source: "TEST" });
    expect(parseMarketRss(`<feed><entry><id>b</id><title>Beta</title><link href="https://example.com/b"/><updated>2026-01-02T00:00:00Z</updated></entry></feed>`, "TEST", "https://example.com").items[0]).toMatchObject({ id: "b", title: "Beta", link: "https://example.com/b" });
  });
});
