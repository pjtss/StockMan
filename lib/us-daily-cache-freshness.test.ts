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
      new Map([["NAS", { eligibleCount: 3, atSourceLatestDateCount: 3 }], ["NYS", { eligibleCount: 3, atSourceLatestDateCount: 3 }], ["AMS", { eligibleCount: 3, atSourceLatestDateCount: 3 }]]),
    );
    expect(result.map(({ market, stale }) => [market, stale])).toEqual([
      ["NAS", true], ["NYS", false], ["AMS", true],
    ]);
  });

  it("detects missing per-instrument candles even when market MAX is current", () => {
    const result = compareUsDailyMarketFreshness(
      new Map([["NAS", "20261123"], ["NYS", "20261123"], ["AMS", "20261123"]]),
      new Map([["NAS", "20261123"], ["NYS", "20261123"], ["AMS", "20261123"]]),
      new Map([["NAS", { eligibleCount: 100, atSourceLatestDateCount: 65 }], ["NYS", { eligibleCount: 80, atSourceLatestDateCount: 80 }], ["AMS", { eligibleCount: 20, atSourceLatestDateCount: 19 }]]),
    );
    expect(result.map(({ market, stale, missingAtSourceLatestDateCount }) => [market, stale, missingAtSourceLatestDateCount])).toEqual([
      ["NAS", true, 35], ["NYS", false, 0], ["AMS", true, 1],
    ]);
  });

  it("fails closed when an exchange source date cannot be established", () => {
    const source = new Map([["NAS", "20261123"]]);
    expect(() => compareUsDailyMarketFreshness(source, new Map(), new Map())).toThrow("US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:NYS");
    source.set("NYS", "20261123");
    expect(() => compareUsDailyMarketFreshness(source, new Map(), new Map())).toThrow("US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:AMS");
    source.set("AMS", "20261123");
    expect(() => compareUsDailyMarketFreshness(source, new Map(), new Map())).toThrow("US_DAILY_FRESHNESS_COVERAGE_UNAVAILABLE:NAS");
  });
});
