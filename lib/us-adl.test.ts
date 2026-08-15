import { describe, expect, it } from "vitest";
import { calculateAdlSeries } from "@/lib/us-adl";

describe("calculateAdlSeries", () => {
  it("accumulates positive and negative money flow", () => {
    const result = calculateAdlSeries([
      { date: "20260102", high: 10, low: 0, close: 10, volume: 100 },
      { date: "20260101", high: 10, low: 0, close: 0, volume: 50 },
      { date: "20260103", high: 10, low: 0, close: 5, volume: 20 },
    ]);
    expect(result.map((x) => x.adl)).toEqual([-50, 50, 50]);
  });
  it("uses zero multiplier for a flat range", () => {
    expect(calculateAdlSeries([{ date: "20260101", high: 5, low: 5, close: 5, volume: 100 }])[0].moneyFlowMultiplier).toBe(0);
  });
});
