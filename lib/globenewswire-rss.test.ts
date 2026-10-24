import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("./market-rss", () => ({ fetchMarketRss: mocks.fetch }));

const previousOverride = process.env.GLOBENEWSWIRE_RSS_URL;

describe("GlobeNewswire RSS endpoint selection", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetch.mockReset();
  });

  afterEach(() => {
    if (previousOverride === undefined) delete process.env.GLOBENEWSWIRE_RSS_URL;
    else process.env.GLOBENEWSWIRE_RSS_URL = previousOverride;
  });

  it.each(["https://rss.globenewswire.com/", "https://www.globenewswire.com/", "https://globenewswire.com/"])(
    "falls back to the official RSS endpoint for the homepage override %s",
    async (override) => {
      process.env.GLOBENEWSWIRE_RSS_URL = override;

      const source = await import("./globenewswire-rss");

      expect(source.GLOBENEWSWIRE_RSS_URL).toBe(source.OFFICIAL_GLOBENEWSWIRE_RSS_URL);
      expect(source.OFFICIAL_GLOBENEWSWIRE_RSS_URL).toMatch(/^https:\/\/rss\.globenewswire\.com\/RssFeed\//);
    },
  );

  it("preserves an explicit RSS feed endpoint override", async () => {
    process.env.GLOBENEWSWIRE_RSS_URL = "https://feeds.example.com/globenewswire.xml";

    const source = await import("./globenewswire-rss");

    expect(source.GLOBENEWSWIRE_RSS_URL).toBe("https://feeds.example.com/globenewswire.xml");
  });
});
