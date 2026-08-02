import { describe, expect, it } from "vitest";
import { calculateMfi, latestMfi } from "./us-mfi";

describe("daily MFI", () => {
  it("returns a bounded value after the requested period", () => {
    const candles = Array.from({ length: 16 }, (_, i) => ({ date: `202607${String(i + 1).padStart(2, "0")}`, high: 10 + i, low: 8 + i, close: 9 + i, volume: 100 }));
    const points = calculateMfi(candles, 14);
    expect(points).toHaveLength(16);
    expect(points[13].value).toBe(50);
    expect(points[15].value).toBeGreaterThanOrEqual(0);
    expect(points[15].value).toBeLessThanOrEqual(100);
  });

  it("identifies persistent negative money flow as oversold", () => {
    const candles = Array.from({ length: 15 }, (_, i) => ({ date: `202607${String(i + 1).padStart(2, "0")}`, high: 20 - i, low: 18 - i, close: 19 - i, volume: 100 }));
    expect(latestMfi(candles, 14)?.value).toBe(0);
  });
});
