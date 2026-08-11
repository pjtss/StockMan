import { describe, expect, it } from "vitest";
import { calculateKrBollingerBands } from "@/lib/kr-bollinger-band";

describe("calculateKrBollingerBands", () => {
  it("uses the latest completed close and flags a lower-band break", () => {
    const candles = Array.from({ length: 20 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: 100, high: 101, low: 90, close: index === 19 ? 50 : 100, volume: 1000 }));
    const point = calculateKrBollingerBands(candles, 20, 2).at(-1);
    expect(point?.close).toBe(50);
    expect(point?.close).toBeLessThanOrEqual(point?.lower ?? 0);
  });
});
