import { describe, expect, it } from "vitest";
import { selectPreviousFiveTradingDays } from "./us-five-day-high-breakout";

describe("five-day high breakout", () => {
  it("selects five prior sessions and excludes the as-of date", () => {
    const candles = Array.from({ length: 7 }, (_, index) => ({ date: `2026080${7 - index}`, open: 1, high: 10 + index, low: 1, close: 5, volume: 100, raw: null }));
    const selected = selectPreviousFiveTradingDays(candles, "20260807");
    expect(selected).toHaveLength(5);
    expect(selected.every((candle) => candle.date < "20260807")).toBe(true);
  });
});

