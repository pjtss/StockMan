import { describe, expect, it } from "vitest";
import { accumulationCandles } from "./accumulation-test-fixtures";
import { ACCUMULATION_POLICY as P, calculateEma, calculateSma, calculateAccumulationFeatures as features, explainAccumulationScore as explain, findRecentGoldenCross, scoreAccumulation, validOhlcv, validTradingDate } from "./accumulation-screener-core";

describe("accumulation v2 math", () => {
  it("uses recursive EMA with first observation seed", () => {
    expect(calculateEma([10, 20, 30], 3)).toEqual([10, 15, 22.5]);
    expect(calculateEma([], 9)).toEqual([]);
    expect(() => calculateEma([1], 0)).toThrow();
    expect(() => calculateEma([NaN], 9)).toThrow();
  });
  it("uses strictly lagged volume SMA20 and includes the last four completed bars", () => {
    const c = accumulationCandles();
    const baseline = calculateSma(c.map(row => row.volume), 20).at(-2)!;
    const f = features(c);
    expect(f.rvol).toBeCloseTo(600 / baseline, 12);
    expect(f.rvol).toBeCloseTo(600 / calculateSma(c.map(row => row.volume), 20).at(-2)!, 12);
    c[c.length - 1].volume *= 2;
    expect(features(c).rvol).toBeCloseTo(f.rvol * 2, 12);
  });
  it("matches independently calculated OBV and ADL 20-bar deltas", () => {
    const f = features(accumulationCandles());
    expect(f.obvChange20).toBe(15 * 100 + 4 * 200 + 600);
    expect(f.adlChange20).toBeCloseTo(2900 * 3 / 7, 8);
  });
  it("accounts for gaps in EMA ATR, rather than only intraday ranges", () => {
    const c = accumulationCandles(), last = c[c.length - 1], prev = c[c.length - 2];
    last.close = prev.close + 10; last.open = last.close - 0.1; last.high = last.close + 0.4; last.low = last.close - 1;
    expect(features(c).atrPercent).toBeCloseTo((1.4 * 19 / 21 + 10.4 * 2 / 21) / last.close, 10);
  });
  it("detects recross even when the start of the window was already aligned", () => {
    expect(findRecentGoldenCross([2, 2, 0, 2, 2, 2], [1, 1, 1, 1, 1, 1])).toBe(3);
    expect(findRecentGoldenCross([2, 2, 0, 2, 2, 0], [1, 1, 1, 1, 1, 1])).toBeNull();
    expect(findRecentGoldenCross([0, 2, 2, 2, 2, 2, 2], [1, 1, 1, 1, 1, 1, 1])).toBeNull();
    expect(findRecentGoldenCross([0, 1, 2], [1, 1, 1])).toBe(2);
  });
  it("counts down days by previous close and measures recovery from the low", () => {
    const c = accumulationCandles();
    [112.1, 112, 112.5, 112.4, 113].forEach((close, i) => Object.assign(c[c.length - 5 + i], { close, open: close - 0.1, high: close + 0.2, low: close - 1 }));
    const f = features(c);
    expect(f.downDays5).toBe(2); expect(f.absorptionRatio5).toBe(1);
    expect(explain(f, 2).find(x => x.code === "absorption")?.points).toBe(10);
    c[c.length - 4].low = 111.99; c[c.length - 4].open = 112;
    c[c.length - 2].low = 112.39; c[c.length - 2].open = 112.4;
    expect(features(c).absorptionRatio5).toBe(0);
  });
  it("awards no absorption bonus without down-day evidence", () => {
    const f = features(accumulationCandles());
    expect(f.absorptionRatio5).toBeNull();
    expect(explain(f, 2).find(x => x.code === "absorption")?.points).toBe(0);
  });
  it("distinguishes persistent volume from an isolated spike", () => {
    const sustained = features(accumulationCandles());
    const c = accumulationCandles(); c.slice(0, -1).forEach(x => x.volume = 100);
    const spike = features(c);
    expect(spike.elevatedVolumeDays5).toBe(1);
    expect(explain(spike, 2).find(x => x.code === "isolatedSpike")?.points).toBe(-15);
    expect(scoreAccumulation(sustained, 2)).toBeGreaterThan(scoreAccumulation(spike, 2));
  });
  it("actually changes the volatility score when ATR expands", () => {
    const f = { ...features(accumulationCandles()), atrContraction: 0.7, priceRange20: 0.1 };
    expect(scoreAccumulation(f, 2) - scoreAccumulation({ ...f, atrContraction: 1.2 }, 2)).toBe(5);
    expect(Object.values(P.weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(explain(f, 2).reduce((sum, x) => sum + x.points, 0)).toBe(scoreAccumulation(f, 2));
  });
  it.each([NaN, Infinity, -1, null])("rejects bad prices %s", price => {
    const c = accumulationCandles(); c[10].close = price as number;
    expect(() => features(c)).toThrow("INVALID_CANDLES");
  });
  it("rejects duplicate/unordered dates and too-short histories", () => {
    const c = accumulationCandles(); c[20].date = c[19].date;
    expect(() => features(c)).toThrow();
    expect(() => features(accumulationCandles(40))).toThrow();
    expect(validTradingDate("20260230")).toBe(false);
    expect(validTradingDate("20260906")).toBe(false);
    expect(validOhlcv({ open: 2, close: 3, high: 2, low: 1, volume: 10 })).toBe(false);
  });
  it("retains zero-volume history, rejects zero baselines, and handles flat ranges", () => {
    const c = accumulationCandles(); c[10].volume = 0;
    expect(Number.isFinite(features(c).rvol)).toBe(true);
    c.slice(0, -1).forEach(x => x.volume = 0);
    expect(() => features(c)).toThrow("ZERO_VOLUME_BASELINE");
    const flat = accumulationCandles(); flat.forEach(x => { x.open = x.high = x.low = x.close = 1; });
    expect(features(flat).adlChange20).toBe(0); expect(features(flat).atrContraction).toBeNull();
  });
});
