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

  it("runs broad US scans by exchange and applies ranking globally", async () => {
    const records = {
      NAS: { code: "AAA", name: "Alpha", marketCap: 300 },
      NYS: { code: "BBB", name: "Bravo", marketCap: 500 },
      AMS: { code: "CCC", name: "Charlie", marketCap: 400 },
    } as const;
    let exchangeIndex = 0;
    query.mockImplementation(async () => {
      const market = (["NAS", "NYS", "AMS"] as const)[exchangeIndex++ % 3];
      const record = records[market];
      return {
        rows: makeCandles("D").map((candle) => ({
          market,
          code: record.code,
          name: record.name,
          market_cap: String(record.marketCap),
          listed_shares: "1000000",
          currency: "USD",
          timeframe: "D",
          ...candle,
        })),
      };
    });

    const results = await runDbScreener({
      market: "US",
      filters: [],
      ranking: [{ field: "marketCap", direction: "DESC" }],
      limit: 1,
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain("RANK() OVER (PARTITION BY u.market ORDER BY f.market_cap DESC NULLS LAST)");
    expect(query.mock.calls[0][1][5]).toBe(1);
    expect(results.map((result) => result.code)).toEqual(["BBB"]);
  });

  it("keeps metric-referenced market-cap filters on the full candidate path", async () => {
    query.mockResolvedValue({
      rows: makeCandles("D").map((candle) => ({
        market: "NAS",
        code: "AAA",
        name: "Alpha",
        market_cap: "40000000000",
        listed_shares: "1000000",
        currency: "USD",
        timeframe: "D",
        ...candle,
      })),
    });

    const results = await runDbScreener({
      market: "US",
      exchange: ["NAS"],
      filters: [{ field: "marketCap", operator: ">=", value: "D.close" }],
      ranking: [{ field: "marketCap", direction: "DESC" }],
      limit: 10,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toContain("RANK() OVER");
    expect(results.map((result) => result.code)).toEqual(["AAA"]);
    expect(results[0].conditions[0]).toMatchObject({ field: "marketCap", target: 164, passed: true });
  });
});
