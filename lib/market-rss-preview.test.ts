import { describe, expect, it } from "vitest";
import { previewMarketRssResults } from "./market-rss-preview";

describe("market-rss-preview", () => {
  it("classifies and grades items without persistence", async () => {
    const result = await previewMarketRssResults([{
      source: "STOCKTITAN",
      ok: true,
      feed: {
        source: "STOCKTITAN",
        fetchedAt: "2026-08-08T00:00:00.000Z",
        items: [{ title: "Acme receives FDA approval | ACME Stock News", summary: "", link: "https://example.com/acme", publishedAt: "2026-08-08T00:00:00.000Z", externalId: "acme" }],
      },
    }], false);
    expect(result[0]).toMatchObject({ ok: true, summary: { itemCount: 1, highGradeCount: 1 } });
    expect((result[0] as { feed: { items: Array<{ grade: string }> } }).feed.items[0].grade).toBe("high");
  });
});
