import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET } from "./route";

describe("GET /api/public/daily-candles market aliases", () => {
  beforeEach(() => {
    vi.stubEnv("DAILY_CACHE_READ_API_KEY", "test-key");
    queryMock.mockReset().mockResolvedValue({ rows: [{ candle_date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, fetched_at: "2026-10-14T01:00:00.000Z" }] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["KR", "035760", "kr_instrument_universe_candles", "KOSPI", "KOSDAQ"],
    ["US", "AAPL", "us_instrument_universe_candles", "NAS", "NYS"],
  ])("resolves the %s chart market alias against its exchange candles", async (market, code, table, firstExchange, secondExchange) => {
    queryMock.mockResolvedValue({ rows: [{ market: firstExchange, name: "Example Corp", candle_date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, fetched_at: "2026-10-14T01:00:00.000Z" }] });
    const response = await GET(new Request(`http://localhost/api/public/daily-candles?market=${market}&code=${code}&timeframe=D&limit=120`, {
      headers: { authorization: "Bearer test-key" },
    }));
    const body = await response.json();
    const [query, values] = queryMock.mock.calls[0] as [string, unknown[]];

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.candles).toHaveLength(1);
    expect(query).toContain(table);
    expect(query).toContain("FROM " + table + " c");
    expect(query).toContain("c.high >= GREATEST(c.open, c.low, c.close)");
    expect(query).toContain("c.candle_date");
    expect(query).toContain("latest.open");
    expect(query).toContain(`market IN ('${firstExchange}', '${secondExchange}'`);
    if (market === "US") expect(query).toContain("COALESCE(u.english_name, '') !~*");
    expect(body.instrument).toEqual({ market: firstExchange, code, name: "Example Corp" });
    expect(body.candles[0].fetchedAt).toBe("2026-10-14T01:00:00.000Z");
    expect(values).toEqual([market, code, "D", 120]);
  });

  it("filters malformed OHLCV rows from the public cache response", async () => {
    queryMock.mockResolvedValue({ rows: [
      { market: "NAS", name: "Apple Inc.", candle_date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, fetched_at: "2026-10-14T01:00:00.000Z" },
      { market: "NAS", name: "Apple Inc.", candle_date: "20261013", open: 10, high: 10.5, low: 9, close: 11, volume: 100, fetched_at: "2026-10-13T01:00:00.000Z" },
      { market: "NAS", name: "Apple Inc.", candle_date: "20261012", open: 10, high: 12, low: 9, close: null, volume: 100, fetched_at: "2026-10-12T01:00:00.000Z" },
    ] });
    const response = await GET(new Request("http://localhost/api/public/daily-candles?market=US&code=AAPL&timeframe=D&limit=120", {
      headers: { authorization: "Bearer test-key" },
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.candles).toEqual([{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, tradingValue: 1100, fetchedAt: "2026-10-14T01:00:00.000Z" }]);
    expect(body.metadata.returnedCount).toBe(1);
    expect(body.instrument).toEqual({ market: "NAS", code: "AAPL", name: "Apple Inc." });
    expect(body.metadata.dataUpdatedAt).toBe("2026-10-14T01:00:00.000Z");
    expect(queryMock.mock.calls[0][0]).toContain("u.instrument_type='COMMON_STOCK'");
    expect(queryMock.mock.calls[0][0]).toContain("COALESCE(u.english_name, '') !~*");
  });

  it("returns instrument identity and shared candle freshness metadata for bulk items", async () => {
    queryMock.mockResolvedValue({ rows: [{ market: "NAS", code: "AAPL", name: "Apple Inc.", candle_date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, fetched_at: "2026-10-14T01:00:00.000Z" }] });
    const response = await GET(new Request("http://localhost/api/public/daily-candles?market=US&codes=AAPL&timeframe=D&limit=120"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      market: "NAS",
      code: "AAPL",
      name: "Apple Inc.",
      candles: [{ date: "20261014", fetchedAt: "2026-10-14T01:00:00.000Z" }],
      metadata: {
        latestCandleDate: "20261014",
        dataUpdatedAt: "2026-10-14T01:00:00.000Z",
        returnedCount: 1,
      },
    });
    expect(body.items[0].candles[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11, volume: 100 });
    expect(queryMock.mock.calls[0][0]).toContain("requested.code");
  });

  it("pages through the official active common-stock universe without authentication", async () => {
    queryMock.mockReset()
      .mockResolvedValueOnce({ rows: [
        { market: "NAS", code: "AAPL", name: "Apple Inc." },
        { market: "NAS", code: "MSFT", name: "Microsoft Corp." },
      ] })
      .mockResolvedValueOnce({ rows: [{ total: 5 }] });
    const response = await GET(new Request("http://localhost/api/public/daily-candles?market=NAS&universe=true&offset=0&pageSize=2"));
    const body = await response.json();
    const [query, values] = queryMock.mock.calls[0] as [string, unknown[]];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      source: "OPERATING_OFFICIAL_UNIVERSE",
      market: "NAS",
      items: [
        { market: "NAS", code: "AAPL", name: "Apple Inc." },
        { market: "NAS", code: "MSFT", name: "Microsoft Corp." },
      ],
      page: { offset: 0, pageSize: 2, total: 5, nextOffset: 2 },
    });
    expect(query).toContain("u.enabled=true");
    expect(query).toContain("u.instrument_type='COMMON_STOCK'");
    expect(query).toContain("u.is_etf=false");
    expect(query).toContain("COALESCE(u.english_name, '') !~*");
    expect(values).toEqual(["NAS", 2, 0]);
  });

  it("rejects invalid universe page bounds", async () => {
    const response = await GET(new Request("http://localhost/api/public/daily-candles?market=KR&universe=true&pageSize=101"));
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
