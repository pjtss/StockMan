import { afterEach, describe, expect, it } from "vitest";
import { chartCandleMemoryKey, clearChartCandleMemory, getChartCandleMemory, setChartCandleMemory } from "./chart-candle-memory-cache";

afterEach(() => clearChartCandleMemory());

describe("raw chart candle process cache", () => {
  it("keys by market, exchange, symbol, and timeframe", () => {
    expect(chartCandleMemoryKey({ market: "US", exchange: "NAS", code: "US:aapl", timeframe: "D" }))
      .toBe("US:NAS:AAPL:D");
    expect(chartCandleMemoryKey({ market: "US", exchange: "NYS", code: "US:AAPL", timeframe: "D" }))
      .not.toBe(chartCandleMemoryKey({ market: "US", exchange: "NAS", code: "AAPL", timeframe: "D" }));
  });

  it("expires snapshots and stores raw candle fields without indicators or raw payloads", () => {
    const key = "KR:KOSDAQ:035760:D";
    setChartCandleMemory(key, [{ date: "20261015", open: 10, high: 12, low: 9, close: 11, volume: 100, tradingValue: 1100, raw: { private: "discard" } }], "2026-10-15T00:00:00.000Z", 1000, 500);

    expect(getChartCandleMemory(key, 1499)).toEqual({
      candles: [{ date: "20261015", open: 10, high: 12, low: 9, close: 11, volume: 100, tradingValue: 1100 }],
      updatedAt: "2026-10-15T00:00:00.000Z",
    });
    expect(getChartCandleMemory(key, 1500)).toBeNull();
  });

  it("does not cache empty or invalid candle sets", () => {
    setChartCandleMemory("empty", [], null);
    setChartCandleMemory("invalid", [{ date: "bad", open: 0, high: 0, low: 0, close: 0, volume: 0 }], null);
    expect(getChartCandleMemory("empty")).toBeNull();
    expect(getChartCandleMemory("invalid")).toBeNull();
  });
});
