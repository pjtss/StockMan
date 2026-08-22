import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";
import { requireAdminSession } from "@/lib/admin-auth";

function formatKst(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(date).replace(" ", "T") + "+09:00";
}

function withKstTimestamp<T extends Record<string, any>>(row: T) {
  return { ...row, startedAtKst: formatKst(row.startedAt), finishedAtKst: formatKst(row.finishedAt) };
}

async function cacheStats(table: "us_instrument_universe_candles" | "kr_instrument_universe_candles") {
  const db = getDb();
  const rows = await db.execute(sql.raw(`SELECT timeframe, COUNT(*)::int AS candle_count, COUNT(DISTINCT market || ':' || code)::int AS instrument_count, MAX(candle_date) AS latest_candle_date, MIN(candle_date) AS earliest_candle_date, MAX(fetched_at) AS latest_fetched_at FROM ${table} GROUP BY timeframe ORDER BY timeframe`));
  return rows.rows;
}

export async function GET() {
  const startedAt = Date.now();
  try {
    await requireAdminSession();
    const db = getDb();
    const [us, kr, usRuns, krRuns, failureRows, failureCountRows, retryRows, retryDueRows, bbRetryRows, bbRetryPendingRows] = await Promise.all([
      cacheStats("us_instrument_universe_candles"),
      cacheStats("kr_instrument_universe_candles"),
      loadRecentAutomationRuns("us-daily-cache", 5),
      loadRecentAutomationRuns("kr-daily-cache", 5),
      db.execute(sql`SELECT market, code, timeframe, error, observed_at FROM instrument_candle_cache_failures ORDER BY observed_at DESC LIMIT 50`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM instrument_candle_cache_failures WHERE observed_at >= NOW() - INTERVAL '24 hours'`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(attempts), 0)::int AS attempts FROM instrument_candle_cache_retries GROUP BY status ORDER BY status`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT market, code, timeframe, attempts, next_attempt_at, last_error FROM instrument_candle_cache_retries WHERE status = 'PENDING' ORDER BY next_attempt_at LIMIT 100`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT scope, zone, status, COUNT(*)::int AS count, COALESCE(SUM(attempts), 0)::int AS attempts FROM daily_bollinger_cache_retries GROUP BY scope, zone, status ORDER BY scope, zone, status`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT scope, zone, status, attempts, next_attempt_at, last_attempt_at, succeeded_at, last_error FROM daily_bollinger_cache_retries WHERE status = 'PENDING' ORDER BY next_attempt_at LIMIT 100`).catch(() => ({ rows: [] } as any)),
    ]);
    const checkedAt = new Date().toISOString();
    const addCacheKst = (rows: any[]) => rows.map((row) => ({ ...row, latest_fetched_at_kst: formatKst(row.latest_fetched_at) }));
    return NextResponse.json({ ok: true, checkedAt, checkedAtKst: formatKst(checkedAt), timezone: "Asia/Seoul", durationMs: Date.now() - startedAt, policy: { D: 86400, W: 86400, M: 604800, unit: "seconds", source: "DB fetched_at" }, cache: { us: addCacheKst(us as any[]), kr: addCacheKst(kr as any[]) }, automation: { us: usRuns.map(withKstTimestamp), kr: krRuns.map(withKstTimestamp) }, failures: { last24h: Number((failureCountRows.rows[0] as any)?.count ?? 0), recent: failureRows.rows.map((row: any) => ({ ...row, observed_at_kst: formatKst(row.observed_at) })) }, retries: { byStatus: retryRows.rows, pending: retryDueRows.rows.map((row: any) => ({ ...row, next_attempt_at_kst: formatKst(row.next_attempt_at) })), pendingCount: retryDueRows.rows.length }, bollingerRetries: { byScopeZoneStatus: bbRetryRows.rows, pending: bbRetryPendingRows.rows.map((row: any) => ({ ...row, next_attempt_at_kst: formatKst(row.next_attempt_at), last_attempt_at_kst: formatKst(row.last_attempt_at), succeeded_at_kst: formatKst(row.succeeded_at) })), pendingCount: bbRetryPendingRows.rows.length } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
