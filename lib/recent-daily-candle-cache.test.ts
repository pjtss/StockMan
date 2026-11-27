import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { refreshRecentDailyCandleCache } from "./recent-daily-candle-cache";

describe("recent daily candle cache maintenance", () => {
  it.each([
    ["KR", "KOSDAQ", "kr_instrument_universe_candles", "kr_recent_daily_candles"],
    ["US", "NYSE", "us_instrument_universe_candles", "us_recent_daily_candles"],
  ] as const)("uses the fixed source and bounded cache tables for %s", async (region, market, source, cache) => {
    const execute = vi.fn(async () => undefined);

    await refreshRecentDailyCandleCache(execute, region, market, "TEST1");

    expect(execute).toHaveBeenCalledTimes(1);
    const statement = execute.mock.calls[0]?.[0];
    expect(statement).toBeDefined();
    const query = new PgDialect().sqlToQuery(statement!);
    expect(query.sql).toContain(`FROM ${source} c`);
    expect(query.sql).toContain(`INSERT INTO ${cache}`);
    expect(query.sql).toContain(`DELETE FROM ${cache} cached`);
    expect(query.sql).toContain("c.timeframe = 'D'");
    expect(query.sql).toContain("c.candle_date ~ '^[0-9]{8}$'");
    expect(query.sql).toContain("c.volume >= 0");
    expect(query.sql).toContain("c.high >= GREATEST(c.open, c.low, c.close)");
    expect(query.sql).toContain("LIMIT 20");
    expect(query.sql).toContain("ON CONFLICT (market, code, candle_date) DO UPDATE");
    expect(query.params).toEqual([market, "TEST1", market, "TEST1"]);
    expect(query.sql).not.toContain("TEST1");
  });
});
