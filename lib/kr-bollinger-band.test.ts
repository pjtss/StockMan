import { describe, expect, it } from "vitest";
import { calculateKrBollingerBands } from "@/lib/kr-bollinger-band";

describe("calculateKrBollingerBands", () => {
  it("uses the latest completed close and flags a lower-band break", () => {
    const candles = Array.from({ length: 20 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: 100, high: 101, low: 90, close: index === 19 ? 50 : 100, volume: 1000 }));
    const point = calculateKrBollingerBands(candles, 20, 2).at(-1);
    expect(point?.close).toBe(50);
    expect(point?.close).toBeLessThanOrEqual(point?.lower ?? 0);
  });

  it("retains the low used for lower-band touch evaluation", () => {
    const candles = Array.from({ length: 20 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: index === 1 ? 90 : 100, high: 101, low: index === 1 ? 90 : 100, close: index === 1 ? 90 : 100, volume: 1000 }));
    candles.push({ date: "20260901", open: 100, high: 101, low: 1, close: 100, volume: 1000 });
    const point = calculateKrBollingerBands(candles, 20, 2).at(-1)!;
    expect(point.low).toBe(1);
    expect(point.close).toBeGreaterThan(point.lower);
    expect(point.low).toBeLessThanOrEqual(point.lower);
  });
});
