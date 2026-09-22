import { describe, expect, it } from "vitest";
import { minuteTradingValue } from "./intraday-turnover";

describe("minute trading value", () => {
  it("uses the delta of KIS cumulative traded value", () => {
    expect(minuteTradingValue({ price: 100, volume: 1, cumulativeTradingValue: 1_250 }, { price: 100, volume: 1, cumulativeTradingValue: 1_000 })).toEqual({ value: 250, source: "KIS_CUMULATIVE_DELTA" });
  });
  it("falls back when the cumulative counter is missing or reset", () => {
    expect(minuteTradingValue({ price: 10, volume: 25, cumulativeTradingValue: 50 }, { price: 10, volume: 25, cumulativeTradingValue: 60 }).source).toBe("PRICE_VOLUME_FALLBACK");
  });
});
