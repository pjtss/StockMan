import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentUniverseSyncRuns } from "@/lib/schema";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const startedAt = Date.now();
  try {
    if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const db = getDb();
    const [kr, us, runs] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled)::int AS enabled, COUNT(*) FILTER (WHERE NOT enabled)::int AS disabled, COUNT(DISTINCT market)::int AS markets, COUNT(*) - COUNT(DISTINCT market || ':' || code)::int AS duplicate_keys FROM kr_instrument_universe`),
      db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled)::int AS enabled, COUNT(*) FILTER (WHERE NOT enabled)::int AS disabled, COUNT(DISTINCT market)::int AS markets, COUNT(*) - COUNT(DISTINCT market || ':' || code)::int AS duplicate_keys FROM us_instrument_universe`),
      db.select().from(instrumentUniverseSyncRuns).orderBy(sql`${instrumentUniverseSyncRuns.startedAt} DESC`).limit(5),
    ]);
    const [krMarkets, usMarkets, krOfficial, productSummary] = await Promise.all([
      db.execute(sql`SELECT market, COUNT(*)::int AS count FROM kr_instrument_universe GROUP BY market ORDER BY market`),
      db.execute(sql`SELECT market, COUNT(*)::int AS count FROM us_instrument_universe GROUP BY market ORDER BY market`),
      db.execute(sql`SELECT security_group_code AS "securityGroupCode", etp_product_class_code AS "etpProductClassCode", preferred_class_code AS "preferredClassCode", trading_halt_code AS "tradingHaltCode", liquidation_code AS "liquidationCode", managed_issue_code AS "managedIssueCode", COUNT(*)::int AS count FROM kr_instrument_universe GROUP BY security_group_code, etp_product_class_code, preferred_class_code, trading_halt_code, liquidation_code, managed_issue_code ORDER BY count DESC, security_group_code LIMIT 500`),
      db.execute(sql`SELECT 'KR' AS scope, instrument_type AS "instrumentType", COUNT(*)::int AS count FROM kr_instrument_universe GROUP BY instrument_type UNION ALL SELECT 'US' AS scope, instrument_type AS "instrumentType", COUNT(*)::int AS count FROM us_instrument_universe GROUP BY instrument_type ORDER BY scope, count DESC`),
    ]);
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, tables: { kr: kr.rows[0], us: us.rows[0] }, marketCounts: { kr: krMarkets.rows, us: usMarkets.rows }, productSummary: productSummary.rows, officialKrClassification: krOfficial.rows, recentSyncRuns: runs });
  } catch (error) {
    console.error("[API /admin/instrument-universe-debug] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "INSTRUMENT_UNIVERSE_DEBUG_UNAVAILABLE", durationMs: Date.now() - startedAt }, { status: 503 });
  }
}
