import { describe, expect, it } from "vitest";
import { selectLatestDailySummaryRows } from "./daily-candle-summary.mjs";

describe("selectLatestDailySummaryRows", () => {
  it("selects each instrument's latest positive-volume candle", () => {
    const older = { code: "AAA", date: "20260922", open: 10, high: 11, low: 9, close: 10, volume: 100 };
    const latest = { code: "AAA", date: "20260923", open: 11, high: 12, low: 10, close: 11, volume: 200 };
    const other = { code: "BBB", date: "20260923", open: 20, high: 21, low: 19, close: 20, volume: "50" as unknown as number };

    expect(selectLatestDailySummaryRows([older, latest, other])).toEqual([latest, other]);
  });

  it("excludes non-traded, missing-date, and invalid-close rows", () => {
    expect(selectLatestDailySummaryRows([
      { code: "ZERO", date: "20260923", open: 10, high: 10, low: 10, close: 10, volume: 0 },
      { code: "NAN", date: "20260923", open: 10, high: 10, low: 10, close: Number.NaN, volume: 1 },
      { code: "NO_DATE", date: "", open: 10, high: 10, low: 10, close: 10, volume: 1 },
    ])).toEqual([]);
  });

  it("keeps a valid older traded candle if the latest candle has no volume", () => {
    const traded = { code: "AAA", date: "20260922", open: 10, high: 11, low: 9, close: 10, volume: 100 };
    const noTrade = { code: "AAA", date: "20260923", open: 10, high: 10, low: 10, close: 10, volume: 0 };

    expect(selectLatestDailySummaryRows([traded, noTrade])).toEqual([traded]);
  });
});
