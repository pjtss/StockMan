import { describe, expect, it } from "vitest";
import { compareUsDailyMarketFreshness, isUsPostCloseWeekday } from "@/lib/us-daily-cache-freshness";

describe("US daily cache freshness probes", () => {
  it("opens a catch-up probe only after a weekday New York close", () => {
    expect(isUsPostCloseWeekday(new Date("2026-11-23T22:59:00.000Z"))).toBe(false);
    expect(isUsPostCloseWeekday(new Date("2026-11-24T01:00:00.000Z"))).toBe(true);
    expect(isUsPostCloseWeekday(new Date("2026-11-29T23:00:00.000Z"))).toBe(false);
  });

  it("detects when an official source has a newer candle than the exchange cache", () => {
    const result = compareUsDailyMarketFreshness(
      new Map([["NAS", "20261123"], ["NYS", "20261123"], ["AMS", "20261123"]]),
      new Map([["NAS", "20261120"], ["NYS", "20261123"], ["AMS", "20261120"]]),
    );
    expect(result.map(({ market, stale }) => [market, stale])).toEqual([
      ["NAS", true], ["NYS", false], ["AMS", true],
    ]);
  });

  it("fails closed when an exchange source date cannot be established", () => {
    expect(() => compareUsDailyMarketFreshness(new Map([["NAS", "20261123"]]), new Map())).toThrow("US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:NYS");
  });
});
