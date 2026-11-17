import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  getPool: () => ({ query }),
}));

import { loadCachedKrDailyCandlesBulk } from "./kr-daily-price-cache";

describe("KR bulk daily candle cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DAILY_CACHE_API_URL;
  });

  it("uses PostgreSQL column aliases and returns candle date with fetched timestamp", async () => {
    query.mockResolvedValueOnce({ rows: [{
      market: "KOSPI",
      code: "005930",
      candleDate: "20261111",
      open: "100",
      high: "110",
      low: "90",
      close: "105",
      volume: "1000",
      fetchedAt: "2026-11-11T07:00:00.000Z",
    }] });

    const result = await loadCachedKrDailyCandlesBulk([{ market: "KOSPI", code: "005930" }], 1, "D");
    expect(query.mock.calls[0][0]).toContain('c.candle_date AS "candleDate"');
    expect(query.mock.calls[0][0]).toContain('c.fetched_at AS "fetchedAt"');
    expect(result.get("KOSPI:005930")).toEqual([{
      date: "20261111",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000,
      fetchedAt: "2026-11-11T07:00:00.000Z",
    }]);
  });
});
