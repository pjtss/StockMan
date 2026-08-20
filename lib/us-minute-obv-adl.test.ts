import { describe, expect, it } from "vitest";
import { calculateMinuteObvAdl } from "./us-minute-obv-adl";

const policy = { topN: 100, obvSignalPeriod: 3, adlSignalPeriod: 3, requireRisingSignals: true, minChangeRate: 0 };

describe("1분봉 OBV·ADL", () => {
  it("calculates volume OBV and high-low ADL with signals", () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ time: `2026082010${String(i).padStart(2, "0")}`, price: 10.8 + i, high: 11 + i, low: 9 + i, volume: 100 + i * 10 }));
    const result = calculateMinuteObvAdl(points, policy);
    expect(result.ready).toBe(true);
    expect(result.obv).toBeGreaterThan(result.obvSignal!);
    expect(result.adl).toBeGreaterThan(result.adlSignal!);
    expect(result.signalsRising).toBe(true);
  });

  it("rejects a series shorter than the signal window", () => {
    const result = calculateMinuteObvAdl([{ time: "1", price: 10, volume: 100 }], policy);
    expect(result.ready).toBe(false);
    expect(result.obv).toBeNull();
  });
});
