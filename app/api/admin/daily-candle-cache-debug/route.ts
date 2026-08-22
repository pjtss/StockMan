import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";
import { requireAdminSession } from "@/lib/admin-auth";

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
    const [us, kr, usRuns, krRuns, failureRows, failureCountRows, retryRows, retryDueRows] = await Promise.all([
      cacheStats("us_instrument_universe_candles"),
      cacheStats("kr_instrument_universe_candles"),
      loadRecentAutomationRuns("us-daily-cache", 5),
      loadRecentAutomationRuns("kr-daily-cache", 5),
      db.execute(sql`SELECT market, code, timeframe, error, observed_at FROM instrument_candle_cache_failures ORDER BY observed_at DESC LIMIT 50`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM instrument_candle_cache_failures WHERE observed_at >= NOW() - INTERVAL '24 hours'`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(attempts), 0)::int AS attempts FROM instrument_candle_cache_retries GROUP BY status ORDER BY status`).catch(() => ({ rows: [] } as any)),
      db.execute(sql`SELECT market, code, timeframe, attempts, next_attempt_at, last_error FROM instrument_candle_cache_retries WHERE status = 'PENDING' ORDER BY next_attempt_at LIMIT 100`).catch(() => ({ rows: [] } as any)),
    ]);
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, policy: { D: 21600, W: 259200, M: 604800, unit: "seconds", source: "DB fetched_at" }, cache: { us, kr }, automation: { us: usRuns, kr: krRuns }, failures: { last24h: Number((failureCountRows.rows[0] as any)?.count ?? 0), recent: failureRows.rows }, retries: { byStatus: retryRows.rows, pending: retryDueRows.rows, pendingCount: retryDueRows.rows.length } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
