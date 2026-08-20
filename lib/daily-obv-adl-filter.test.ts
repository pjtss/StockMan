import { describe, expect, it } from "vitest";
import { calculateObvAdlSignal } from "./daily-obv-adl-filter";

describe("daily OBV/ADL signal filter", () => {
  it("calculates both signals and identifies sustained strength", () => {
    const candles = Array.from({ length: 24 }, (_, index) => ({
      date: `202608${String(index + 1).padStart(2, "0")}`,
      close: 100 + index * 2,
      high: 103 + index * 2,
      low: 90,
      volume: 1000 + index * 100,
    }));
    const result = calculateObvAdlSignal(candles, 9, 9);
    expect(result.ready).toBe(true);
    expect(result.obvAboveSignal).toBe(true);
    expect(result.adlAboveSignal).toBe(true);
    expect(result.obv).toBeGreaterThan(result.obvSignal);
    expect(result.adl).toBeGreaterThan(result.adlSignal);
  });

  it("does not mark a short series ready", () => {
    const result = calculateObvAdlSignal([{ date: "20260801", close: 100, high: 101, low: 99, volume: 1000 }], 9, 9);
    expect(result.ready).toBe(false);
    expect(result.obvAboveSignal).toBe(false);
    expect(result.adlAboveSignal).toBe(false);
  });
});
