import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const exportedAt = new Date().toISOString();
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT u.code, u.name, u.market, u.standard_code AS "standardCode",
             f.price, f.change_rate AS "changeRate", f.open, f.high, f.low,
             f.volume, f.trading_value AS "tradingValue", f.market_cap AS "marketCap",
             f.shares_outstanding AS "sharesOutstanding", f.free_float_shares AS "freeFloatShares",
             f.free_float_percent AS "freeFloatPercent", f.currency, f.source,
             f.observed_at AS "observedAt", f.fetched_at AS "fetchedAt",
             f.raw_payload AS "rawPayload"
      FROM kr_instrument_universe u
      LEFT JOIN instrument_fundamental_snapshots f ON f.market = 'KR' AND f.code = u.code
      WHERE u.instrument_type = 'COMMON_STOCK'
      ORDER BY u.market, u.code
    `);
    const items = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      rawPayload: typeof row.rawPayload === "string" ? (() => { try { return JSON.parse(row.rawPayload as string); } catch { return row.rawPayload; } })() : row.rawPayload,
    }));
    return new NextResponse(JSON.stringify({ ok: true, market: "KR", exportedAt, count: items.length, items }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="domestic-financial-data-${exportedAt.slice(0, 10)}.json"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, exportedAt, error: error instanceof Error ? error.message : "EXPORT_FAILED" }, { status: 500 });
  }
}
