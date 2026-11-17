import { afterEach, describe, expect, it } from "vitest";
import { chartDataMemoryKey, clearChartDataMemory, getChartDataMemory, normalizeUsableChartData, setChartDataMemory } from "./chart-data-memory-cache";
import type { ChartData } from "./kis-chart";

const data = (code: string): ChartData => ({
  code,
  company: "Test",
  candles: [{ date: "20261112", open: 1, high: 2, low: 1, close: 2, volume: 10 }],
  indicators: { rsi14: null, macd: null, macdSignal: null, macdHist: null, bbUpper: null, bbMiddle: null, bbLower: null },
  latestPrice: 2,
  latestChange: "",
  latestChangeRate: "",
});

afterEach(clearChartDataMemory);

describe("chart data memory cache", () => {
  it("rejects empty candles or invalid chart price metadata", () => {
    expect(normalizeUsableChartData({ ...data("A"), candles: [] })).toBeNull();
    expect(normalizeUsableChartData({ ...data("A"), latestPrice: Number.NaN })).toBeNull();
    expect(normalizeUsableChartData({ ...data("A"), candles: [{ date: "20261112", open: 0, high: 0, low: 0, close: 0, volume: 1 }] })).toBeNull();
    expect(normalizeUsableChartData(data("A"))?.candles).toHaveLength(1);
  });

  it("drops candles with coerced booleans or empty numeric fields before caching", () => {
    const valid = data("A").candles[0];
    const normalized = normalizeUsableChartData({
      ...data("A"),
      candles: [valid, { ...valid, open: true, high: true, low: true, close: true, volume: true }, { ...valid, volume: "" }],
    });

    expect(normalized?.candles).toEqual([valid]);
    setChartDataMemory("strict-fields", { ...data("A"), candles: [valid, { ...valid, volume: "" } as never] }, 1_000);
    expect(getChartDataMemory("strict-fields", 1_001)?.candles).toEqual([valid]);
  });

  it("expires entries after the default one-minute lifetime", () => {
    setChartDataMemory("KR:005930:KOSPI:D", data("005930"), 1_000);

    expect(getChartDataMemory("KR:005930:KOSPI:D", 60_999)?.code).toBe("005930");
    expect(getChartDataMemory("KR:005930:KOSPI:D", 61_000)).toBeNull();
  });

  it("rejects invalid clocks and TTL values instead of creating immortal entries", () => {
    setChartDataMemory("invalid-clock", data("A"), Number.NaN);
    setChartDataMemory("infinite-ttl", data("B"), 1_000, Number.POSITIVE_INFINITY);
    setChartDataMemory("overflow-expiry", data("C"), Number.MAX_VALUE, Number.MAX_VALUE);
    setChartDataMemory("invalid-ttl", data("D"), 1_000, Number.NaN);

    expect(getChartDataMemory("invalid-clock", 1_001)).toBeNull();
    expect(getChartDataMemory("infinite-ttl", 1_001)).toBeNull();
    expect(getChartDataMemory("overflow-expiry", 1_001)).toBeNull();
    expect(getChartDataMemory("invalid-ttl", 1_001)).toBeNull();

    setChartDataMemory("valid", data("E"), 1_000);
    expect(getChartDataMemory("valid", Number.NaN)).toBeNull();
  });

  it("normalizes market, ticker, exchange, and timeframe in cache keys", () => {
    expect(chartDataMemoryKey("us:aapl", "5", "nas")).toBe("US:AAPL:NAS:5");
    expect(chartDataMemoryKey(" US:aapl ", "5", " nas ")).toBe("US:AAPL:NAS:5");
    expect(chartDataMemoryKey("005930", "d")).toBe("KR:005930:*:D");
  });

  it("keeps identical tickers from different markets and exchanges separate", () => {
    expect(chartDataMemoryKey("US:ABC", "5", "NAS")).not.toBe(chartDataMemoryKey("ABC", "5", "NAS"));
    expect(chartDataMemoryKey("US:ABC", "5", "NAS")).not.toBe(chartDataMemoryKey("US:ABC", "5", "NYS"));
  });

  it("evicts the least recently used item after reaching the entry limit", () => {
    for (let index = 0; index < 128; index += 1) setChartDataMemory(`key-${index}`, data(String(index)), 0);
    getChartDataMemory("key-0", 1);
    setChartDataMemory("key-128", data("128"), 1);

    expect(getChartDataMemory("key-0", 2)).not.toBeNull();
    expect(getChartDataMemory("key-1", 2)).toBeNull();
  });

  it("removes expired entries before evicting fresh cache items", () => {
    for (let index = 0; index < 64; index += 1) setChartDataMemory(`fresh-${index}`, data(String(index)), 0, 10_000);
    for (let index = 0; index < 64; index += 1) setChartDataMemory(`expired-${index}`, data(String(index)), 0, 10);

    setChartDataMemory("new", data("new"), 20);

    expect(getChartDataMemory("fresh-0", 21)).not.toBeNull();
    expect(getChartDataMemory("expired-63", 21)).toBeNull();
    expect(getChartDataMemory("new", 21)).not.toBeNull();
  });
});
