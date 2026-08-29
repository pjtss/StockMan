import { getPool } from "@/lib/db";

/** 시장별 최신 일봉 거래일과 정확히 일치하지 않는 종목을 비활성화한다. */
export async function syncDailyActivityStatus() {
  const pool = getPool();
  const result: Record<string, number> = {};
  for (const [universe, candles, markets] of [
    ["kr_common_stock_universe", "kr_instrument_universe_candles", ["KOSPI", "KOSDAQ"]],
    ["us_common_stock_universe", "us_instrument_universe_candles", ["NAS", "AMS", "NYS"]],
  ] as const) {
    const r = await pool.query(`WITH market_latest AS (SELECT market, max(candle_date) AS candle_date FROM ${candles} WHERE timeframe='D' AND volume>0 AND market=ANY($1) GROUP BY market), latest AS (SELECT market, code, max(candle_date) AS candle_date FROM ${candles} WHERE timeframe='D' AND volume>0 GROUP BY market, code) UPDATE ${universe} u SET daily_active = (latest.candle_date = market_latest.candle_date), updated_at = NOW() FROM latest JOIN market_latest USING(market) WHERE u.market = latest.market AND u.code = latest.code AND u.market = ANY($1) RETURNING u.daily_active`, [markets]);
    result[universe] = r.rowCount ?? 0;
  }
  return result;
}
