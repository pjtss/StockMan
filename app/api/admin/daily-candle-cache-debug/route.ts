import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";
import { requireAdminSession } from "@/lib/admin-auth";

async function cacheStats(table: "us_instrument_universe_candles" | "kr_instrument_universe_candles") {
  const db = getDb();
  const rows = await db.execute(sql.raw(`SELECT timeframe, COUNT(*)::int AS candle_count, COUNT(DISTINCT market || ':' || code)::int AS instrument_count, MAX(fetched_at) AS latest_fetched_at FROM ${table} GROUP BY timeframe ORDER BY timeframe`));
  return rows.rows;
}

export async function GET() {
  const startedAt = Date.now();
  try {
    await requireAdminSession();
    const [us, kr, usRuns, krRuns] = await Promise.all([
      cacheStats("us_instrument_universe_candles"),
      cacheStats("kr_instrument_universe_candles"),
      loadRecentAutomationRuns("us-daily-cache", 5),
      loadRecentAutomationRuns("kr-daily-cache", 5),
    ]);
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, policy: { D: 21600, W: 259200, M: 604800, unit: "seconds", source: "DB fetched_at" }, cache: { us, kr }, automation: { us: usRuns, kr: krRuns } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
