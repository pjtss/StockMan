import { describe, expect, it } from "vitest";
import { calculateBollingerBands } from "@/lib/us-bollinger-band";

describe("calculateBollingerBands", () => {
  it("calculates the lower band from completed daily closes", () => {
    const candles = Array.from({ length: 20 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: 10, high: 10, low: 10, close: 10, volume: 100, raw: null }));
    candles.push({ date: "20260901", open: 8, high: 9, low: 7, close: 8, volume: 200, raw: null });
    const point = calculateBollingerBands(candles, 20, 2).at(-1)!;
    expect(point.date).toBe("20260901");
    expect(point.middle).toBe(9.9);
    expect(point.close).toBeLessThan(point.lower);
  });

  it("returns no point when the period is not available", () => {
    expect(calculateBollingerBands([{ date: "20260801", open: 1, high: 1, low: 1, close: 1, volume: 1, raw: null }], 20)).toEqual([]);
  });

  it("keeps the candle low for lower-band touch evaluation", () => {
    const candles = Array.from({ length: 20 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: index === 1 ? 9 : 10, high: 10, low: index === 1 ? 9 : 10, close: index === 1 ? 9 : 10, volume: 100, raw: null }));
    candles.push({ date: "20260901", open: 10, high: 11, low: 1, close: 10, volume: 100, raw: null });
    const point = calculateBollingerBands(candles, 20, 2).at(-1)!;
    expect(point.low).toBe(1);
    expect(point.close).toBeGreaterThan(point.lower);
    expect(point.low).toBeLessThanOrEqual(point.lower);
  });
});
