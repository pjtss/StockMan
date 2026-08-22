import { describe, expect, it } from "vitest";
import { currentUsMarketDate, excludeCurrentUsMarketCandle } from "./us-market-date";

describe("US market date handling", () => {
  it("uses the US calendar date instead of the KST calendar date", () => {
    expect(currentUsMarketDate(new Date("2026-08-11T01:00:00.000Z"))).toBe("20260810");
  });

  it("uses Friday during the US weekend", () => {
    expect(currentUsMarketDate(new Date("2026-08-22T16:00:00.000Z"))).toBe("20260821");
    expect(currentUsMarketDate(new Date("2026-08-23T16:00:00.000Z"))).toBe("20260821");
  });

  it("removes the partial current-session candle from historical scans", () => {
    const rows = [
      { date: "20260811", open: 2, high: 2, low: 2, close: 2, volume: 10, raw: null },
      { date: "20260810", open: 1, high: 1, low: 1, close: 1, volume: 10, raw: null },
    ];
    expect(excludeCurrentUsMarketCandle(rows, "20260811").map((row) => row.date)).toEqual(["20260810"]);
  });
});
