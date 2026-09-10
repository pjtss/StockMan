import { getPool } from "@/lib/db";

/** 시장별 최신 일봉에서 7일을 초과해 지연된 종목과 일봉이 없는 종목을 비활성화한다. */
const ACTIVITY_STATUS_TTL_MS = 60_000;
let lastActivityStatus: { market?: "KR" | "US"; expiresAt: number; value: Record<string, number> } | null = null;
const activityStatusInflight = new Map<string, Promise<Record<string, number>>>();

export async function syncDailyActivityStatus(market?: "KR" | "US") {
  if (lastActivityStatus && lastActivityStatus.market === market && lastActivityStatus.expiresAt > Date.now()) return lastActivityStatus.value;
  const inflightKey = market ?? "ALL";
  const existing = activityStatusInflight.get(inflightKey);
  if (existing) return existing;
  const request = syncDailyActivityStatusUncached(market);
  activityStatusInflight.set(inflightKey, request);
  try {
    const value = await request;
    lastActivityStatus = { market, value, expiresAt: Date.now() + ACTIVITY_STATUS_TTL_MS };
    return value;
  } finally {
    if (activityStatusInflight.get(inflightKey) === request) activityStatusInflight.delete(inflightKey);
  }
}

async function syncDailyActivityStatusUncached(market?: "KR" | "US") {
  const pool = getPool();
  const result: Record<string, number> = {};
  const jobs = ([
    ["kr_common_stock_universe", "kr_latest_daily_candles", ["KOSPI", "KOSDAQ"]],
    ["us_common_stock_universe", "us_latest_daily_candles", ["NAS", "AMS", "NYS"]],
  ] as const).filter(([universe]) => !market || (market === "KR" ? universe.startsWith("kr_") : universe.startsWith("us_")));
  await Promise.all(jobs.map(async ([universe, candles, markets]) => {
    const r = await pool.query(`WITH market_latest AS (SELECT market, max(candle_date) AS candle_date FROM ${candles} WHERE volume>0 AND market=ANY($1) GROUP BY market), latest AS (SELECT market, code, candle_date FROM ${candles} WHERE volume>0 AND market=ANY($1)), desired_status AS (SELECT u.market, u.code, EXISTS (SELECT 1 FROM latest l WHERE l.market = u.market AND l.code = u.code AND l.candle_date >= to_char(to_date(ml.candle_date, 'YYYYMMDD') - interval '7 days', 'YYYYMMDD')) AS daily_active FROM ${universe} u JOIN market_latest ml ON ml.market = u.market WHERE u.market=ANY($1)) UPDATE ${universe} u SET daily_active = d.daily_active, updated_at = NOW() FROM desired_status d WHERE u.market=d.market AND u.code=d.code AND u.daily_active IS DISTINCT FROM d.daily_active RETURNING u.daily_active`, [markets]);
    result[universe] = r.rowCount ?? 0;
  }));
  return result;
}
