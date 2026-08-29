import { describe, expect, it } from "vitest";
import { analyzeTechnicalEntry } from "./technical-entry-analysis";

const candles = Array.from({ length: 45 }, (_, index) => {
  const close = 100 + index * 1.5;
  return { date: `202608${String(index + 1).padStart(2, "0")}`, open: close - 1, high: close + 2, low: close - 2, close, volume: 1000, updatedAt: "2026-08-29T00:00:00.000Z" };
});

describe("technical entry analysis", () => {
  it("returns a reproducible metadata-rich result", () => {
    const result = analyzeTechnicalEntry(candles);
    expect(result.latestDate).toBe(candles.at(-1)!.date);
    expect(result.latestUpdatedAt).toBe("2026-08-29T00:00:00.000Z");
    expect(result.indicators.macd).not.toBeNull();
    expect(result.indicators.bollingerLower).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("does not fabricate indicators without enough history", () => {
    const result = analyzeTechnicalEntry(candles.slice(0, 10));
    expect(result.state).toBe("INSUFFICIENT_HISTORY");
    expect(result.indicators.macd).toBeNull();
  });
});
