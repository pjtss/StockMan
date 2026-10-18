import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, dbExecute } = vi.hoisted(() => ({ poolQuery: vi.fn(), dbExecute: vi.fn() }));

vi.mock("@/lib/kis-chart", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/kis-chart")>(),
  fetchChartData: vi.fn().mockResolvedValue({
    code: "005930", company: "삼성전자", candles: Array.from({ length: 21 }, (_, i) => ({ date: `202608${String(i + 1).padStart(2, "0")}`, open: 100, high: 110, low: 90, close: 100 + i, volume: 1000, tradingValue: 500000 })),
    indicators: { rsi14: 50, macd: 1, macdSignal: 0, macdHist: 1, bbUpper: 120, bbMiddle: 105, bbLower: 90 }, latestPrice: 120, latestChange: "+1", latestChangeRate: "+0.8%", candleDataUpdatedAt: "2026-08-29T00:00:00.000Z",
  }),
  fetchUsChartData: vi.fn(),
}));
vi.mock("@/lib/kis-us-daily-price", () => ({ fetchUsDailyPrice: vi.fn() }));
vi.mock("@/lib/remote-daily-candle-cache", () => ({ loadRemoteDailyCandles: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/remote-stock-chart", () => ({ loadRemoteStockChart: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/chart-candle-memory-cache", async () => await vi.importActual("@/lib/chart-candle-memory-cache"));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: poolQuery }), getDb: () => ({ execute: dbExecute }) }));

import { GET } from "./route";
import { fetchChartData } from "@/lib/kis-chart";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { loadRemoteDailyCandles } from "@/lib/remote-daily-candle-cache";
import { loadRemoteStockChart } from "@/lib/remote-stock-chart";
import { chartCandleMemoryKey, clearChartCandleMemory, setChartCandleMemory } from "@/lib/chart-candle-memory-cache";

beforeEach(() => {
  vi.clearAllMocks();
  clearChartCandleMemory();
  vi.mocked(loadRemoteDailyCandles).mockResolvedValue(null);
  vi.mocked(loadRemoteStockChart).mockResolvedValue(null);
  vi.mocked(fetchUsDailyPrice).mockReset().mockResolvedValue(null);
  poolQuery.mockImplementation(async (query: string, params: unknown[] = []) => {
    if (query.includes("FROM us_common_stock_universe")) return { rows: [{ market: params[1] ?? "NAS" }] };
    return { rows: [] };
  });
  dbExecute.mockResolvedValue({ rows: [{ marketCap: 1000000000, tradingValue: 600000, volume: 1200, currency: "KRW", observedAt: "2026-08-28T00:00:00.000Z", fetchedAt: "2026-08-28T00:00:00.000Z", source: "TEST" }, ...Array.from({ length: 20 }, () => ({ tradingValue: 500000, volume: 1000 }))] });
});

describe("chart fundamentals response", () => {
  it("includes currency, averages, RVOL, and separate timestamps", async () => {
    const response = await GET(new Request("http://localhost/api/stock/chart?code=005930&market=KR&timeframe=D"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.company).toBe("삼성전자");
    expect(json.fundamentals.currency).toBe("KRW");
    expect(json.fundamentals.averageVolume20).toBe(1000);
    expect(json.fundamentals.averageTradingValue20).toBe(500000);
    expect(json.fundamentals.rvol).toBe(1.2);
    expect(json.fundamentals.fetchedAt).not.toBe(json.candleDataUpdatedAt);
    expect(response.headers.get("server-timing")).toContain("kis;dur=");
    expect(response.headers.get("server-timing")).toContain("fundamentals;dur=");
  });

  it("falls through to KIS when the configured remote candle cache has no data", async () => {
    const previousUrl = process.env.DAILY_CACHE_API_URL;
    process.env.DAILY_CACHE_API_URL = "https://cache.example.test";
    try {
      const response = await GET(new Request("http://localhost/api/stock/chart?code=005930&market=KR&timeframe=D"));
      expect(response.status).toBe(200);
      expect(fetchChartData).toHaveBeenCalledWith("005930", "D");
    } finally {
      if (previousUrl === undefined) delete process.env.DAILY_CACHE_API_URL;
      else process.env.DAILY_CACHE_API_URL = previousUrl;
    }
  });

  it("uses the modal-provided US exchange instead of probing exchanges serially", async () => {
    vi.mocked(fetchUsDailyPrice).mockResolvedValue({
      ok: true,
      status: 200,
      request: { method: "GET", url: "", headers: {} },
      response: { rawText: "", parsed: {} },
      candles: [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, raw: {} }],
      diagnostics: { httpStatus: 200, kisOk: true, rtCd: "0", msgCd: null, msg1: null, outputKey: "output", rawOutputCount: 1, parsedCandleCount: 1, firstDate: "20261014", lastDate: "20261014" },
    });
    const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AAAPL&market=US&exchange=NYS&timeframe=D"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.candles).toHaveLength(1);
    expect(fetchUsDailyPrice).toHaveBeenCalledTimes(1);
    expect(fetchUsDailyPrice).toHaveBeenCalledWith({ code: "AAPL", market: "NYS", timeframe: "D" });
  });

  it("resolves an omitted US exchange from the active common-stock master and makes one KIS request", async () => {
    vi.mocked(fetchUsDailyPrice).mockResolvedValue({
      ok: true, status: 200, request: { method: "GET", url: "", headers: {} }, response: { rawText: "", parsed: {} },
      candles: [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, raw: {} }],
      diagnostics: { httpStatus: 200, kisOk: true, rtCd: "0", msgCd: null, msg1: null, outputKey: "output", rawOutputCount: 1, parsedCandleCount: 1, firstDate: "20261014", lastDate: "20261014" },
    });
    const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AAAPL&market=US&timeframe=D"));
    expect(response.status).toBe(200);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("us_common_stock_universe"), ["AAPL", null]);
    expect(fetchUsDailyPrice).toHaveBeenCalledTimes(1);
    expect(fetchUsDailyPrice).toHaveBeenCalledWith({ code: "AAPL", market: "NAS", timeframe: "D" });
  });

  it("returns cached US candles before calling KIS", async () => {
    poolQuery.mockImplementation(async (query: string, params: unknown[] = []) => {
      if (query.includes("FROM us_common_stock_universe")) return { rows: [{ market: "NAS" }] };
      if (query.includes("FROM us_instrument_universe_candles")) return { rows: [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100, fetchedAt: "2026-10-14T00:00:00.000Z" }] };
      return { rows: [] };
    });
    const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AAAPL&market=US&timeframe=D"));
    expect(response.status).toBe(200);
    expect((await response.json()).candles).toHaveLength(1);
    expect(fetchUsDailyPrice).not.toHaveBeenCalled();
  });

  it("fails closed without probing KIS when an active common stock cannot be confirmed", async () => {
    poolQuery.mockImplementation(async (query: string) => query.includes("FROM us_instrument_universe_candles")
      ? { rows: [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100 }] }
      : { rows: [] });
    const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AUNKNOWN&market=US&timeframe=D"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ chartStatus: "UNAVAILABLE", eligibility: "FAIL_CLOSED" });
    expect(fetchUsDailyPrice).not.toHaveBeenCalled();
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it("uses raw candle memory without caching indicators or querying providers again", async () => {
    const key = chartCandleMemoryKey({ market: "US", code: "US:AAPL", exchange: "NAS", timeframe: "D" });
    setChartCandleMemory(key, [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100 }], "2026-10-14T00:00:00.000Z");
    const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AAAPL&market=US&exchange=NAS&timeframe=D"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.candles).toHaveLength(1);
    expect(json.indicators.rsi14).toBeNull();
    expect(loadRemoteDailyCandles).not.toHaveBeenCalled();
    expect(fetchUsDailyPrice).not.toHaveBeenCalled();
    expect(loadRemoteStockChart).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).toContain("chart;dur=");
  });

  it("uses the remote chart API only after the local KIS and database providers miss", async () => {
    const previousUrl = process.env.DAILY_CACHE_API_URL;
    process.env.DAILY_CACHE_API_URL = "https://stockman.example.test";
    vi.mocked(fetchUsDailyPrice).mockResolvedValue(null);
    vi.mocked(fetchChartData).mockResolvedValue(null);
    vi.mocked(loadRemoteStockChart).mockResolvedValue({
      code: "US:AAPL", company: "Apple Inc.", candles: [{ date: "20261014", open: 10, high: 12, low: 9, close: 11, volume: 100 }],
      indicators: { rsi14: null, macd: null, macdSignal: null, macdHist: null, bbUpper: null, bbMiddle: null, bbLower: null },
      latestPrice: 11, latestChange: "+1", latestChangeRate: "+10%", candleDataUpdatedAt: "2026-10-14T00:00:00.000Z",
    });
    try {
      const response = await GET(new Request("http://localhost/api/stock/chart?code=US%3AAAPL&company=Apple%20Inc.&market=US&exchange=NAS&timeframe=D"));
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.candles).toHaveLength(1);
      expect(fetchUsDailyPrice).toHaveBeenCalledTimes(1);
      expect(loadRemoteStockChart).toHaveBeenCalledWith(expect.objectContaining({ market: "US", code: "US:AAPL", exchange: "NAS", timeframe: "D" }));
    } finally {
      if (previousUrl === undefined) delete process.env.DAILY_CACHE_API_URL;
      else process.env.DAILY_CACHE_API_URL = previousUrl;
    }
  });
});
