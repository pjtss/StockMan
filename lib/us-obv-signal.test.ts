import { describe, expect, it } from "vitest";
import { analyzeUsObvSignal, calculateUsObvSeries } from "./us-obv-signal";

function candles(closes: number[]) {
  return closes.map((close, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: close, high: close, low: close, close, volume: 100, raw: null }));
}

describe("daily OBV signal", () => {
  it("keeps one continuous OBV series and detects a recent golden cross", () => {
    const rows = calculateUsObvSeries(candles([10, 9, 8, 7, 6, 5, 4, 5, 6, 7, 8, 9]));
    expect(rows.at(-1)?.obv).toBe(-100);
    const analysis = analyzeUsObvSignal(candles([10, 9, 8, 7, 6, 5, 4, 5, 6, 7, 8, 9]), { signalPeriod: 3, consecutiveDays: 3, crossoverLookback: 5 });
    expect(analysis.aboveSignal).toBe(true);
    expect(analysis.crossedRecently).toBe(true);
    expect(analysis.crossoverDate).not.toBeNull();
    expect(analysis.signalGap).toBeGreaterThan(0);
  });

  it("does not pass when OBV is above Signal for fewer than the required days", () => {
    const analysis = analyzeUsObvSignal(candles([10, 9, 8, 7, 6, 5, 4, 5, 6]), { signalPeriod: 3, consecutiveDays: 3, crossoverLookback: 5 });
    expect(analysis.aboveSignalDays).toBeLessThan(3);
    expect(analysis.aboveSignal).toBe(false);
  });
});
