import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kis-chart", () => ({
  fetchChartData: vi.fn().mockResolvedValue({
    code: "005930", company: "삼성전자", candles: Array.from({ length: 21 }, (_, i) => ({ date: `202608${String(i + 1).padStart(2, "0")}`, open: 100, high: 110, low: 90, close: 100 + i, volume: 1000, tradingValue: 500000 })),
    indicators: { rsi14: 50, macd: 1, macdSignal: 0, macdHist: 1, bbUpper: 120, bbMiddle: 105, bbLower: 90 }, latestPrice: 120, latestChange: "+1", latestChangeRate: "+0.8%", candleDataUpdatedAt: "2026-08-29T00:00:00.000Z",
  }),
  fetchUsChartData: vi.fn(),
}));
vi.mock("@/lib/kis-us-daily-price", () => ({ fetchUsDailyPrice: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: vi.fn().mockResolvedValue({ rows: [{ marketCap: 1000000000, tradingValue: 600000, volume: 1200, currency: "KRW", observedAt: "2026-08-28T00:00:00.000Z", fetchedAt: "2026-08-28T00:00:00.000Z", source: "TEST" }, ...Array.from({ length: 20 }, () => ({ tradingValue: 500000, volume: 1000 }))] }) }) }));

import { GET } from "./route";

describe("chart fundamentals response", () => {
  it("includes currency, averages, RVOL, and separate timestamps", async () => {
    const response = await GET(new Request("http://localhost/api/stock/chart?code=005930&market=KR&timeframe=D"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.fundamentals.currency).toBe("KRW");
    expect(json.fundamentals.averageVolume20).toBe(1000);
    expect(json.fundamentals.averageTradingValue20).toBe(500000);
    expect(json.fundamentals.rvol).toBe(1.2);
    expect(json.fundamentals.fetchedAt).not.toBe(json.candleDataUpdatedAt);
  });
});
