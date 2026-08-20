import { describe, expect, it } from "vitest";
import { calculateGoldenCross } from "./daily-golden-cross";

const candles = (values: number[]) => values.map((close, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, close }));

describe("daily golden cross", () => {
  it("requires a 9-day average crossing above the 20-day average", () => {
    const values = Array.from({ length: 20 }, () => 100).concat([200]);
    expect(calculateGoldenCross(candles(values)).qualifies).toBe(true);
  });
  it("does not qualify without enough history", () => {
    expect(calculateGoldenCross(candles([1, 2, 3])).reason).toBe("INSUFFICIENT_HISTORY");
  });
});
