import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({ getPool: () => ({ query }) }));

import { runDbScreener } from "./db-screener";

function makeCandles(timeframe: "D" | "W") {
  return Array.from({ length: 65 }, (_, index) => ({
    candle_date: new Date(Date.UTC(timeframe === "D" ? 2026 : 2025, 0, index + 1))
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", ""),
    fetched_at: "2026-11-17T01:40:16.607Z",
    close: String(100 + index),
    high: String(102 + index),
    low: String(99 + index),
    volume: "1000",
  }));
}

describe("database screener candle rows", () => {
  beforeEach(() => query.mockReset());

  it("reconstructs indicators and timeframe metadata from row-shaped candles", async () => {
    query.mockResolvedValue({
      rows: [
        ...["D", "W"].flatMap((timeframe) => makeCandles(timeframe as "D" | "W").map((candle) => ({
          market: "KOSPI",
          code: "005930",
          name: "삼성전자",
          market_cap: "40000000000",
          listed_shares: "1000000",
          currency: "KRW",
          timeframe,
          ...candle,
        }))),
      ],
    });

    const results = await runDbScreener({
      market: "KR",
      timeframe: "D",
      filters: [],
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      code: "005930",
      name: "삼성전자",
      candleDate: makeCandles("D").at(-1)?.candle_date,
      candleFetchedAt: "2026-11-17T01:40:16.607Z",
    });
    expect(results[0].timeframeMeta.W.candleDate).toBe(
      makeCandles("W").at(-1)?.candle_date,
    );
    expect(query.mock.calls[0][0]).not.toContain("JSON_AGG");
  });
});
