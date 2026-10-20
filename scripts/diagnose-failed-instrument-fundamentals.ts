import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

const sinceArg = process.argv.find((arg) => arg.startsWith("--since="))?.split("=", 2)[1];
const expectedArg = process.argv.find((arg) => arg.startsWith("--expect-count="))?.split("=", 2)[1];
const since = new Date(sinceArg ?? "");
const expectedCount = Number(expectedArg);
if (!Number.isFinite(since.getTime()) || !Number.isInteger(expectedCount) || expectedCount < 1) {
  throw new Error("Usage: diagnose-failed-instrument-fundamentals.ts --since=<ISO timestamp> --expect-count=<n>");
}

loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
  throw new Error(`Refusing to diagnose non-local database host: ${database.hostname}`);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
async function main() {
  try {
    const { rows } = await pool.query(`
      WITH refreshed AS (
        SELECT DISTINCT market,code FROM instrument_fundamental_history WHERE fetched_at >= $1::timestamptz
      ), missing AS (
        SELECT u.* FROM us_common_stock_universe u
        LEFT JOIN refreshed r USING (market,code)
        WHERE u.enabled=true AND r.code IS NULL
      )
      SELECT m.market,m.code,m.name,m.english_name,m.instrument_type,m.security_type,m.etp_type,
        m.is_etf,m.is_warrant,m.is_derivative,m.is_dr,m.enabled,m.source_file,m.last_seen_at::date AS last_seen_date,m.missing_runs,
        COALESCE(s.enabled,false) AS active_in_special,s.instrument_type AS special_instrument_type,
        snap.price AS previous_price,candle.candle_date AS latest_daily_candle_date,
        candle.close AS latest_daily_close,candle.volume AS latest_daily_volume,
        q.status AS kis_http_status,q.parsed->>'rt_cd' AS kis_rt_cd,q.parsed->>'msg_cd' AS kis_msg_cd,
        q.parsed->'output'->>'last' AS kis_output_last
      FROM missing m
      LEFT JOIN us_special_instrument_universe s USING (market,code)
      LEFT JOIN instrument_fundamental_snapshots snap USING (market,code)
      LEFT JOIN us_price_detail_cache q USING (market,code)
      LEFT JOIN LATERAL (
        SELECT candle_date,fetched_at,close,volume FROM us_instrument_universe_candles c
        WHERE c.market=m.market AND c.code=m.code AND c.timeframe='D'
        ORDER BY c.candle_date DESC LIMIT 1
      ) candle ON true
      ORDER BY m.market,m.code
    `, [since.toISOString()]);
    if (rows.length !== expectedCount) {
      throw new Error(`Failure scope changed: expected ${expectedCount}, found ${rows.length}; diagnostic did not continue`);
    }

    const { rows: universeRuns } = await pool.query(`
      SELECT scope,source_directory,status,source_count,inserted_count,updated_count,deactivated_count,
        excluded_count,error_count,error_summary,started_at,completed_at
      FROM instrument_universe_sync_runs
      ORDER BY started_at DESC
      LIMIT 12
    `);
    const { rows: candleCoverage } = await pool.query(`
      SELECT market,timeframe,MAX(candle_date) AS latest_date,COUNT(*) AS row_count,
        COUNT(*) FILTER (WHERE volume > 0) AS positive_volume_count,
        COUNT(*) FILTER (WHERE candle_date >= '20260901') AS rows_since_september
      FROM us_instrument_universe_candles
      GROUP BY market,timeframe
      ORDER BY market,timeframe
    `);

    const summary = rows.reduce<Record<string, number>>((counts, row) => {
      const status = !row.latest_daily_candle_date ? "noDailyCandle"
        : row.latest_daily_candle_date < "20260924" ? "dailyCandleBefore20260924" : "dailyCandleRecent";
      counts[status] = (counts[status] ?? 0) + 1;
      if (row.active_in_special) counts.activeInSpecial = (counts.activeInSpecial ?? 0) + 1;
      if (Number(row.missing_runs) > 0) counts.withMissingRuns = (counts.withMissingRuns ?? 0) + 1;
      return counts;
    }, {});
    const instruments = rows.map((row) => ({
      market: row.market,
      code: row.code,
      name: row.english_name,
      securityType: row.security_type,
      instrumentType: row.instrument_type,
      lastSeen: row.last_seen_date,
      latestDaily: row.latest_daily_candle_date,
      latestClose: row.latest_daily_close,
      latestVolume: row.latest_daily_volume,
      kisStatus: row.kis_http_status,
      kisCode: row.kis_msg_cd,
      outputLast: row.kis_output_last,
    }));
    console.info(`[fundamentals-failure-diagnosis] ${JSON.stringify({ databaseHost: database.hostname, since: since.toISOString(), count: rows.length, summary, universeRuns, candleCoverage, instruments })}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[fundamentals-failure-diagnosis-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
