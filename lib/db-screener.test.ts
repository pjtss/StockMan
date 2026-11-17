import { describe, expect, it } from "vitest";
import { buildInstrumentDailyLatestCtes, minimumScreenerMarketCap, screenerMarketCapFreshnessPredicate } from "./db-screener";

describe("instrument daily latest CTEs", () => {
  it("enforces the domestic default cap floor while preserving US requests", () => {
    expect(minimumScreenerMarketCap(false, null)).toBe(30_000_000_000);
    expect(minimumScreenerMarketCap(false, 10_000_000_000)).toBe(30_000_000_000);
    expect(minimumScreenerMarketCap(false, 50_000_000_000)).toBe(50_000_000_000);
    expect(minimumScreenerMarketCap(true, null)).toBeNull();
  });
  it("requires fresh KRW cap data for domestic screening only", () => {
    expect(screenerMarketCapFreshnessPredicate(false)).toContain("f.currency = 'KRW'");
    expect(screenerMarketCapFreshnessPredicate(false)).toContain("f.fetched_at <= NOW()");
    expect(screenerMarketCapFreshnessPredicate(false)).toContain("INTERVAL '24 hours'");
    expect(screenerMarketCapFreshnessPredicate(true)).toBe("");
  });
  it("uses valid OHLCV rows including zero-volume days from summary cache", () => {
    const sql = buildInstrumentDailyLatestCtes({ asOf: false, universeTable: "us_common_stock_universe", candleTable: "us_instrument_universe_candles", latestSummaryTable: "us_latest_daily_candles" });
    expect(sql).toContain("FROM us_latest_daily_candles l WHERE CASE WHEN l.candle_date ~ '^[0-9]{8}$' THEN");
    expect(sql).toContain("l.high >= GREATEST(l.open, l.low, l.close)");
    expect(sql).not.toMatch(/l\.volume\s*>\s*0/);
  });

  it("applies the same rule to as-of raw candle selection and rejects unsafe table names", () => {
    const sql = buildInstrumentDailyLatestCtes({ asOf: true, universeTable: "kr_common_stock_universe", candleTable: "kr_instrument_universe_candles", latestSummaryTable: "kr_latest_daily_candles" });
    expect(sql).toContain("FROM kr_instrument_universe_candles c WHERE c.market=u.market");
    expect(sql).toContain("c.low <= LEAST(c.open, c.high, c.close)");
    expect(sql).not.toMatch(/c\.volume\s*>\s*0/);
    expect(() => buildInstrumentDailyLatestCtes({ asOf: false, universeTable: "users;--", candleTable: "x", latestSummaryTable: "x" })).toThrow("INVALID_DAILY_LATEST_TABLE");
  });
});
