import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Rebuilds weekly OHLCV from persisted daily candles for the eligible universe.
 * KIS is the source for D; W is a deterministic local projection of D.
 */
export async function upsertWeeklyFromDaily(market: "KR" | "US", options: { minDailyCoverage?: number; runDailyTotal?: number; runDailySuccess?: number } = {}) {
  const db = getDb();
  const universe = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
  const candles = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
  const coverage = await db.execute(sql.raw(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${candles} c WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'D' AND c.close IS NOT NULL))::int AS ready FROM ${universe} u WHERE u.enabled = true AND u.daily_active = true`));
  const total = Number((coverage.rows[0] as any)?.total ?? 0);
  const ready = Number((coverage.rows[0] as any)?.ready ?? 0);
  const ratio = total > 0 ? ready / total : 0;
  const minCoverage = options.minDailyCoverage ?? 0.9;
  if (options.runDailyTotal !== undefined) {
    const runRatio = options.runDailyTotal > 0 ? (options.runDailySuccess ?? 0) / options.runDailyTotal : 0;
    if (runRatio < minCoverage) return { market, skipped: true, reason: "RUN_DAILY_SUCCESS_BELOW_GATE", dailyTotal: total, dailyReady: ready, dailyCoverage: Number(ratio.toFixed(4)), runDailyTotal: options.runDailyTotal, runDailySuccess: options.runDailySuccess ?? 0, runDailySuccessRate: Number(runRatio.toFixed(4)), requiredCoverage: minCoverage, upserted: 0, weeklyCandleCount: 0, source: "LOCAL_DERIVED" };
  }
  else if (ratio < minCoverage) return { market, skipped: true, reason: "DAILY_COVERAGE_BELOW_GATE", dailyTotal: total, dailyReady: ready, dailyCoverage: Number(ratio.toFixed(4)), requiredCoverage: minCoverage, upserted: 0, weeklyCandleCount: 0, source: "LOCAL_DERIVED" };
  const result = await db.execute(sql.raw(`
    WITH weekly AS (
      SELECT c.market, c.code,
             MAX(c.candle_date) FILTER (WHERE c.candle_date IS NOT NULL) AS candle_date,
             MAX(c.candle_date) AS period_end_date,
             (array_agg(c.open ORDER BY c.candle_date ASC))[1] AS open,
             MAX(c.high) AS high,
             MIN(c.low) AS low,
             (array_agg(c.close ORDER BY c.candle_date DESC))[1] AS close,
             SUM(COALESCE(c.volume, 0)) AS volume
      FROM ${candles} c
             JOIN ${universe} u ON u.market = c.market AND u.code = c.code AND u.enabled = true AND u.daily_active = true
      WHERE c.timeframe = 'D' AND c.close IS NOT NULL
      GROUP BY c.market, c.code, DATE_TRUNC('week', TO_DATE(c.candle_date, 'YYYYMMDD'))
    )
    INSERT INTO ${candles} (market, code, timeframe, candle_date, period_end_date, candle_time, open, high, low, close, volume, source, fetched_at)
    SELECT market, code, 'W', candle_date, period_end_date, NULL, open, high, low, close, volume, 'LOCAL_DERIVED', NOW()
    FROM weekly
    ON CONFLICT (market, code, timeframe, candle_date) DO UPDATE SET
      period_end_date = EXCLUDED.period_end_date, open = EXCLUDED.open, high = EXCLUDED.high,
      low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume,
      source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at
  `));
  await db.execute(sql.raw(`DELETE FROM ${candles} c WHERE c.timeframe = 'W' AND NOT EXISTS (SELECT 1 FROM ${universe} u WHERE u.market = c.market AND u.code = c.code AND u.enabled = true)`));
  const count = await db.execute(sql.raw(`SELECT COUNT(*)::int AS count FROM ${candles} c WHERE c.timeframe = 'W' AND EXISTS (SELECT 1 FROM ${universe} u WHERE u.market = c.market AND u.code = c.code AND u.enabled = true)`));
  return { market, skipped: false, dailyTotal: total, dailyReady: ready, dailyCoverage: Number(ratio.toFixed(4)), requiredCoverage: minCoverage, upserted: Number((result as any).rowCount ?? 0), weeklyCandleCount: Number((count.rows[0] as any)?.count ?? 0), source: "LOCAL_DERIVED" };
}
