import { getPool } from "@/lib/db";

/** 시장별 최신 일봉에서 7일을 초과해 지연된 종목과 일봉이 없는 종목을 비활성화한다. */
const ACTIVITY_STATUS_TTL_MS = 60_000;
let lastActivityStatus: { expiresAt: number; value: Record<string, number> } | null = null;
let activityStatusInflight: Promise<Record<string, number>> | null = null;

export async function syncDailyActivityStatus() {
  if (lastActivityStatus && lastActivityStatus.expiresAt > Date.now()) return lastActivityStatus.value;
  if (activityStatusInflight) return activityStatusInflight;
  activityStatusInflight = syncDailyActivityStatusUncached();
  try {
    const value = await activityStatusInflight;
    lastActivityStatus = { value, expiresAt: Date.now() + ACTIVITY_STATUS_TTL_MS };
    return value;
  } finally {
    activityStatusInflight = null;
  }
}

async function syncDailyActivityStatusUncached() {
  const pool = getPool();
  const result: Record<string, number> = {};
  await Promise.all(([
    ["kr_common_stock_universe", "kr_latest_daily_candles", ["KOSPI", "KOSDAQ"]],
    ["us_common_stock_universe", "us_latest_daily_candles", ["NAS", "AMS", "NYS"]],
  ] as const).map(async ([universe, candles, markets]) => {
    const r = await pool.query(`WITH market_latest AS (SELECT market, max(candle_date) AS candle_date FROM ${candles} WHERE volume>0 AND market=ANY($1) GROUP BY market), latest AS (SELECT market, code, candle_date FROM ${candles} WHERE volume>0 AND market=ANY($1)) UPDATE ${universe} u SET daily_active = EXISTS (SELECT 1 FROM latest l WHERE l.market = u.market AND l.code = u.code AND l.candle_date >= to_char(to_date(market_latest.candle_date, 'YYYYMMDD') - interval '7 days', 'YYYYMMDD')), updated_at = NOW() FROM market_latest WHERE u.market = market_latest.market AND u.market = ANY($1) RETURNING u.daily_active`, [markets]);
    result[universe] = r.rowCount ?? 0;
  }));
  return result;
}
