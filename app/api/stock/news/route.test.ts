import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => database.rows }),
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";

describe("stock news API summary", () => {
  beforeEach(() => {
    database.rows = [
      {
        id: 1,
        title: "Company reports revenue growth",
        translatedTitle: "매출 성장 발표",
        summary: "<p>Raw publisher HTML summary</p>",
        normalizedSummary: "Revenue grew during the quarter.",
        translatedSummary: null,
        link: "https://example.com/news/1",
        publishedAt: null,
        source: "NASDAQ",
        detectedTicker: "TEST",
        translationStatus: "TRANSLATED",
      },
      {
        id: 2,
        title: "8-K - Example Corp. (0000000000) (Filer)",
        translatedTitle: null,
        summary: "<b>Filed:</b> 2026-10-27 <b>AccNo:</b> 0000000000-26-000001 <b>Size:</b> 10 KB",
        normalizedSummary: "",
        translatedSummary: null,
        link: "https://example.com/filing/2",
        publishedAt: null,
        source: "SEC_EDGAR",
        detectedTicker: "TEST",
        translationStatus: "PENDING",
      },
      {
        id: 3,
        title: "Another company update",
        translatedTitle: null,
        summary: "Legacy raw value",
        normalizedSummary: "<p>Persisted <b>text</b> with markup.</p>",
        translatedSummary: null,
        link: "https://example.com/news/3",
        publishedAt: null,
        source: "STOCKTITAN",
        detectedTicker: "TEST",
        translationStatus: "PENDING",
      },
    ];
  });

  it("returns normalized text for stored, legacy, and unexpectedly marked-up values", async () => {
    const response = await GET(new Request("http://localhost/api/stock/news?ticker=TEST"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items.map((item: { summary: string }) => item.summary)).toEqual([
      "Revenue grew during the quarter.",
      "8-K - Example Corp. (0000000000) (Filer)",
      "Persisted text with markup.",
    ]);
    expect(JSON.stringify(body.items)).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(body.items[0]).not.toHaveProperty("normalizedSummary");
  });
});
