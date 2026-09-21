import { describe, expect, it } from "vitest";
import { evaluateDayTradeSignal } from "./daytrade-signal";

const makeCandles = (closes: number[], volumes: number[] = []) => closes.map((close, index) => ({ date: `202609${String(index + 1).padStart(2, "0")}`, open: close - 0.5, high: close + 1, low: close - 1, close, volume: volumes[index] ?? 100 }));

describe("daytrade signal", () => {
  it("requires a complete daily confirmation set", () => {
    const result = evaluateDayTradeSignal(makeCandles(Array.from({ length: 40 }, (_, index) => 100 + index), Array.from({ length: 39 }, () => 100).concat(250)));
    expect(result.qualifies).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(["CLOSE_ABOVE_EMA9", "EMA9_ABOVE_EMA20", "RVOL_CONFIRMED", "OBV_RISING", "ADL_RISING"]));
  });
  it("does not manufacture a signal without enough history", () => expect(evaluateDayTradeSignal(makeCandles([100, 101, 102])).state).toBe("INSUFFICIENT_HISTORY"));
  it("rejects a low-volume bearish close", () => { const rows = makeCandles(Array.from({ length: 39 }, (_, index) => 100 + index).concat(138)); rows.at(-1)!.open = 139; rows.at(-1)!.volume = 50; const result = evaluateDayTradeSignal(rows); expect(result.qualifies).toBe(false); expect(result.warnings).toEqual(expect.arrayContaining(["RVOL_BELOW_THRESHOLD", "NOT_BULLISH_CLOSE"])); });
});
