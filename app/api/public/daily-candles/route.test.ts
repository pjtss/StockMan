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
    const response = await GET(new Request(`http://localhost/api/public/daily-candles?market=${market}&code=${code}&timeframe=D&limit=120`, {
      headers: { authorization: "Bearer test-key" },
    }));
    const body = await response.json();
    const [query, values] = queryMock.mock.calls[0] as [string, unknown[]];

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.candles).toHaveLength(1);
    expect(query).toContain(table);
    expect(query).toContain(`market IN ('${firstExchange}', '${secondExchange}'`);
    expect(values).toEqual([market, code, "D", 120]);
  });
});
