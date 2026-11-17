import { getPool } from "@/lib/db";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";

export type DailyActivityPool = { query: (text: string, values?: unknown[]) => Promise<{ rowCount?: number | null }> };

/** 시장별 최신 일봉에서 7일을 초과해 지연된 종목과 일봉이 없는 종목을 비활성화한다. */
const ACTIVITY_STATUS_TTL_MS = 60_000;
const activityStatusCache = new Map<string, { expiresAt: number; value: Record<string, number> }>();
const activityStatusInflight = new Map<string, Promise<Record<string, number>>>();

export async function syncDailyActivityStatus(market?: "KR" | "US", poolOverride?: DailyActivityPool) {
  // Test/diagnostic pools must not read or write the process-wide production cache.
  if (poolOverride) return syncDailyActivityStatusUncached(market, poolOverride);
  const inflightKey = market ?? "ALL";
  const cached = activityStatusCache.get(inflightKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = activityStatusInflight.get(inflightKey);
  if (existing) return existing;
  const request = syncDailyActivityStatusUncached(market, poolOverride);
  activityStatusInflight.set(inflightKey, request);
  try {
    const value = await request;
    activityStatusCache.set(inflightKey, { value, expiresAt: Date.now() + ACTIVITY_STATUS_TTL_MS });
    return value;
  } finally {
    if (activityStatusInflight.get(inflightKey) === request) activityStatusInflight.delete(inflightKey);
  }
}

async function syncDailyActivityStatusUncached(market?: "KR" | "US", poolOverride?: DailyActivityPool) {
  const pool = poolOverride ?? getPool();
  const result: Record<string, number> = {};
  const jobs = ([
    ["kr_common_stock_universe", "kr_latest_daily_candles", ["KOSPI", "KOSDAQ"]],
    ["us_common_stock_universe", "us_latest_daily_candles", ["NAS", "AMS", "NYS"]],
  ] as const).filter(([universe]) => !market || (market === "KR" ? universe.startsWith("kr_") : universe.startsWith("us_")));
  await Promise.all(jobs.map(async ([universe, candles, markets]) => {
    const eligible = universe.startsWith("kr_")
      ? "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false AND COALESCE(u.trading_halt_code,'') NOT IN ('Y','1') AND COALESCE(u.liquidation_code,'') NOT IN ('Y','1') AND COALESCE(u.managed_issue_code,'')<>'Y'"
      : "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_dr,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
    const r = await pool.query(`WITH eligible_universe AS (SELECT u.market,u.code FROM ${universe} u WHERE ${eligible} AND u.market=ANY($1)), valid_candles AS (SELECT c.market,c.code,c.candle_date FROM ${candles} c JOIN eligible_universe e ON e.market=c.market AND e.code=c.code WHERE ${validDailyCandleSql("c")} AND c.market=ANY($1)), market_latest AS (SELECT market,MAX(candle_date) AS candle_date FROM valid_candles GROUP BY market), desired_status AS (SELECT u.market,u.code,EXISTS (SELECT 1 FROM valid_candles c WHERE c.market=u.market AND c.code=u.code AND c.candle_date >= to_char(to_date(ml.candle_date,'YYYYMMDD') - interval '7 days','YYYYMMDD')) AS daily_active FROM ${universe} u JOIN market_latest ml ON ml.market=u.market WHERE ${eligible} AND u.market=ANY($1)) UPDATE ${universe} u SET daily_active=d.daily_active,updated_at=NOW() FROM desired_status d WHERE u.market=d.market AND u.code=d.code AND u.daily_active IS DISTINCT FROM d.daily_active RETURNING u.daily_active`, [markets]);
    result[universe] = r.rowCount ?? 0;
  }));
  return result;
}
