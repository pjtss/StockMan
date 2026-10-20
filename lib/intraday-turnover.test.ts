import { describe, expect, it } from "vitest";
import { filterValidIntradayPoints, isSuccessfulMinuteQuoteResponse, minuteTradingValue } from "./intraday-turnover";

describe("minute trading value", () => {
  it("uses the delta of KIS cumulative traded value", () => {
    expect(minuteTradingValue({ price: 100, volume: 1, cumulativeTradingValue: 1_250 }, { price: 100, volume: 1, cumulativeTradingValue: 1_000 })).toEqual({ value: 250, source: "KIS_CUMULATIVE_DELTA" });
  });
  it("falls back when the cumulative counter is missing or reset", () => {
    expect(minuteTradingValue({ price: 10, volume: 25, cumulativeTradingValue: 50 }, { price: 10, volume: 25, cumulativeTradingValue: 60 }).source).toBe("PRICE_VOLUME_FALLBACK");
  });
  it("does not let empty or invalid quote points become synthetic zero observations", () => {
    const usable = filterValidIntradayPoints([
      { time: "2026-09-25T10:02:00", price: 0, volume: 0 },
      { time: "2026-09-25T10:01:00", price: 12, volume: 4 },
      { time: "2026-09-25T10:03:00", price: 13, volume: -1 },
    ]);

    expect(usable).toEqual([{ time: "2026-09-25T10:01:00", price: 12, volume: 4 }]);
    expect(filterValidIntradayPoints([{ price: 0, volume: 0 }])).toEqual([]);
  });
  it("requires a successful KIS response before its points can be used", () => {
    expect(isSuccessfulMinuteQuoteResponse({ ok: true })).toBe(true);
    expect(isSuccessfulMinuteQuoteResponse({ ok: false })).toBe(false);
    expect(isSuccessfulMinuteQuoteResponse(null)).toBe(false);
  });
});
