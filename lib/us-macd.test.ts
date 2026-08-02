import { describe, expect, it } from "vitest";
import { calculateMacd, latestMacd } from "./us-macd";

describe("daily MACD", () => {
  it("calculates MACD and signal for enough candles", () => {
    const candles = Array.from({ length: 40 }, (_, i) => ({ date: `20260${String(i + 1).padStart(2, "0")}`, close: 10 + i }));
    const points = calculateMacd(candles);
    expect(points).toHaveLength(40);
    expect(latestMacd(candles)?.bullish).toBe(true);
    expect(points.at(-1)!.histogram).toBeGreaterThan(0);
  });
  it("requires fast period to be lower than slow period", () => expect(() => calculateMacd([{ date: "1", close: 1 }], 26, 12, 9)).toThrow());
});
