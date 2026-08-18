import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentUniverseSyncRuns } from "@/lib/schema";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const startedAt = Date.now();
  try {
    await requireAdminSession();
    const db = getDb();
    const [kr, us, runs] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled)::int AS enabled, COUNT(*) FILTER (WHERE NOT enabled)::int AS disabled, COUNT(DISTINCT market)::int AS markets, COUNT(*) - COUNT(DISTINCT market || ':' || code)::int AS duplicate_keys FROM kr_instrument_universe`),
      db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled)::int AS enabled, COUNT(*) FILTER (WHERE NOT enabled)::int AS disabled, COUNT(DISTINCT market)::int AS markets, COUNT(*) - COUNT(DISTINCT market || ':' || code)::int AS duplicate_keys FROM us_instrument_universe`),
      db.select().from(instrumentUniverseSyncRuns).orderBy(sql`${instrumentUniverseSyncRuns.startedAt} DESC`).limit(5),
    ]);
    const [krMarkets, usMarkets] = await Promise.all([
      db.execute(sql`SELECT market, COUNT(*)::int AS count FROM kr_instrument_universe GROUP BY market ORDER BY market`),
      db.execute(sql`SELECT market, COUNT(*)::int AS count FROM us_instrument_universe GROUP BY market ORDER BY market`),
    ]);
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, tables: { kr: kr[0], us: us[0] }, marketCounts: { kr: krMarkets, us: usMarkets }, recentSyncRuns: runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
