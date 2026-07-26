import { describe, expect, it } from "vitest";
import { calculatePercent, normalizeAlpacaSymbol, scoreShortPressure } from "./alpaca-short-borrow";

describe("Alpaca short borrow calculations", () => {
  it("normalizes and validates symbols", () => {
    expect(normalizeAlpacaSymbol(" tsla ")).toBe("TSLA");
    expect(() => normalizeAlpacaSymbol("bad symbol")).toThrow("SYMBOL_INVALID");
  });

  it("calculates previous-value percentages safely", () => {
    expect(calculatePercent(2_000, 10_000)).toBe(-80);
    expect(calculatePercent(1, 0)).toBeNull();
  });

  it("scores a severe HTB deterioration as extreme", () => {
    const result = scoreShortPressure({ shortable: true, borrowStatus: "HTB", availableQtyChangePercent: -90, locateFeeRatePercent: 10, locatePriceChangePercent: 300 });
    expect(result.pressureScore).toBeGreaterThanOrEqual(75);
    expect(result.pressureLevel).toBe("EXTREME");
  });
});
