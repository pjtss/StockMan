import { describe, expect, it } from "vitest";
import { accumulationAsOf as asOf, accumulationInstrument as instrument } from "./accumulation-test-fixtures";
import { evaluateAccumulationScan as scan, normalizeAccumulationOptions } from "./accumulation-scan";
import { cacheDateCutoff, createClosedCandleCheck } from "./accumulation-session";

describe("shared market scan and freshness", () => {
  it.each([null, NaN, Infinity, 30000000000, 29999999999])("enforces the strict KR cap floor for %s", cap => {
    const row = instrument("005930", "KOSPI"); row.marketCap = cap;
    expect(scan("KR", [row], { asOf }).summary.exclusions.MARKET_CAP_TOO_SMALL_OR_UNKNOWN).toBe(1);
  });
  it("produces identical KR/US features, score, reasons and candle provenance", () => {
    const kr = scan("KR", [instrument("005930", "KOSPI")], { asOf }).results[0];
    const us = scan("US", [instrument()], { asOf }).results[0];
    expect(kr.metrics).toEqual(us.metrics); expect(kr.scoreBreakdown).toEqual(us.scoreBreakdown);
    expect(kr.timeframeMeta).toEqual(us.timeframeMeta);
    expect(kr.timeframeMeta.daily.usedCandles).toHaveLength(65);
    expect(kr.currency).toBe("KRW"); expect(us.currency).toBe("USD");
  });
  it("does not invent US turnover ratios when capitalization is unknown", () => {
    const row = instrument(); row.marketCap = null;
    expect(scan("US", [row], { asOf }).results[0].turnoverRatio).toBeNull();
  });
  it("separates stale symbols from latest-date candidates and reports empty history", () => {
    const stale = instrument("OLD"); stale.candles.pop();
    const empty = instrument("NONE"); empty.candles = [];
    const report = scan("US", [instrument(), stale, empty], { asOf });
    expect(report.summary).toMatchObject({ eligible: 3, matched: 1, excluded: 2, exclusions: { STALE_SYMBOL_DATE: 1, NO_HISTORY: 1 } });
  });
  it("reports later placeholders without pretending they are completed bars", () => {
    const row = instrument(), last = row.candles.at(-1)!;
    row.candles.push({ ...last, date: "20260904", volume: 0, updatedAt: "2026-09-04T07:00:00Z" });
    const report = scan("US", [row], { asOf });
    expect(report.results[0].candleDate).toBe(last.date);
    expect(report.cache.storedDateByMarket.NAS).toBe("20260904");
    expect(report.warnings.some(x => x.includes("미완성"))).toBe(true);
  });
  it("does not skip an invalid, zero-volume or intraday latest candle to manufacture a match", () => {
    for (const [reason, mutate] of [
      ["INVALID_CANDLES", (x: ReturnType<typeof instrument>) => { x.candles.at(-1)!.low = NaN; }],
      ["ZERO_LATEST_VOLUME", (x: ReturnType<typeof instrument>) => { x.candles.at(-1)!.volume = 0; }],
      ["INCOMPLETE_CANDLES", (x: ReturnType<typeof instrument>) => { x.candles.at(-1)!.updatedAt = "2026-08-28T15:00:00Z"; }],
    ] as const) {
      const row = instrument("BAD"); mutate(row);
      const report = scan("US", [instrument(), row], { asOf });
      expect(report.summary.exclusions[reason]).toBe(1);
    }
  });
  it("checks incomplete historical bars as well as the latest bar", () => {
    const row = instrument(); row.candles[0].updatedAt = "2026-06-01T15:00:00Z";
    expect(scan("US", [row], { asOf }).summary.exclusions.INCOMPLETE_CANDLES).toBe(1);
  });
  it("exposes exact counts before truncation, deterministic tie order and minimum score", () => {
    const report = scan("US", [instrument("BBB"), instrument("AAA")], { asOf, limit: 1 });
    expect(report.summary).toMatchObject({ matched: 2, returned: 1, truncated: true });
    expect(report.tickers).toBe("AAA");
    const high = scan("US", [instrument()], { asOf, minScore: 100 });
    expect(high.count).toBe(0); expect(high.summary.exclusions.BELOW_MIN_SCORE).toBe(1);
    expect(scan("US", [], { asOf }).cache.latestDateByMarket).toEqual({});
  });
  it("normalizes non-finite direct-call options", () => {
    expect(normalizeAccumulationOptions({ limit: NaN, minRvol: Infinity, minScore: NaN })).toMatchObject({ limit: 100, minRvol: 2, minScore: 0 });
  });
});

describe("closed candle checks", () => {
  it.each([
    ["US", "20260701", "2026-07-01T19:59:00Z", false],
    ["US", "20260701", "2026-07-01T20:00:00Z", true],
    ["US", "20260105", "2026-01-05T20:59:00Z", false],
    ["US", "20260105", "2026-01-05T21:00:00Z", true],
    ["KR", "20260701", "2026-07-01T06:29:00Z", false],
    ["KR", "20260701", "2026-07-01T06:30:00Z", true],
  ] as const)("%s %s %s => %s", (region, date, fetched, expected) => {
    expect(createClosedCandleCheck(region, asOf)(date, fetched)).toBe(expected);
  });
  it("rejects future timestamps, invalid dates and weekends", () => {
    const closed = createClosedCandleCheck("US", asOf);
    expect(closed("20260904", "2026-09-07T00:00:00Z")).toBe(false);
    expect(closed("20260905", "2026-09-05T23:00:00Z")).toBe(false);
    expect(closed("bad", "invalid")).toBe(false);
  });
  it("cuts off ongoing sessions without using a fixed UTC offset", () => {
    expect(cacheDateCutoff("US", new Date("2026-07-01T19:59:00Z"))).toBe("20260630");
    expect(cacheDateCutoff("US", new Date("2026-01-05T21:00:00Z"))).toBe("20260105");
    expect(cacheDateCutoff("KR", new Date("2026-07-01T06:30:00Z"))).toBe("20260701");
  });
});
