import { describe, expect, it } from "vitest";
import { calculateGoldenCross } from "./daily-golden-cross";

const candles = (values: number[]) => values.map((close, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, close, high: close + 1, low: close - 2, volume: 1000 }));

describe("daily golden cross", () => {
  it("requires a recent EMA crossing and both OBV/ADL signals above their signals", () => {
    const values = Array.from({ length: 20 }, () => 100).concat([200]);
    expect(calculateGoldenCross(candles(values)).qualifies).toBe(true);
  });
  it("does not qualify without enough history", () => {
    expect(calculateGoldenCross(candles([1, 2, 3])).reason).toBe("INSUFFICIENT_HISTORY");
  });
});
