import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const allowedMarkets = new Set(["KR", "US"]);
const tables = {
  KR: { universe: "kr_common_stock_universe", special: "kr_special_instrument_universe", candles: "kr_instrument_universe_candles" },
  US: { universe: "us_common_stock_universe", special: "us_special_instrument_universe", candles: "us_instrument_universe_candles" },
} as const;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "UNAUTHORIZED" }, { status: 401 });
  const market = new URL(request.url).searchParams.get("market")?.toUpperCase() || "US";
  if (!allowedMarkets.has(market)) return NextResponse.json({ ok: false, requestId, error: "INVALID_MARKET" }, { status: 400 });
  const config = tables[market as "KR" | "US"];
  try {
    const pool = getPool();
    const [counts, breakdown, indexes, explain] = await Promise.all([
      pool.query(`SELECT (SELECT COUNT(*) FROM ${config.universe} WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK')::bigint AS active_universe, (SELECT COUNT(*) FROM ${config.candles} WHERE timeframe='D' AND volume>0)::bigint AS daily_candles`),
      pool.query(`SELECT 'common' AS bucket, COUNT(*)::bigint AS row_count, COUNT(*) FILTER (WHERE instrument_type='COMMON_STOCK')::bigint AS common_stock_count FROM ${config.universe} UNION ALL SELECT 'special', COUNT(*)::bigint, COUNT(*) FILTER (WHERE instrument_type='COMMON_STOCK')::bigint FROM ${config.special}`),
      pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('instrument_fundamental_screener_latest_idx','${market === "US" ? "us_candles_screener_cover_idx" : "kr_candles_screener_cover_idx"}') ORDER BY indexname`),
      pool.query(`EXPLAIN (FORMAT JSON, COSTS true) SELECT market_cap FROM instrument_fundamental_snapshots WHERE market=$1 AND code=(SELECT code FROM ${config.universe} WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK' LIMIT 1) ORDER BY observed_at DESC NULLS LAST, fetched_at DESC NULLS LAST LIMIT 1`, [market === "US" ? "NAS" : "KOSPI"]),
    ]);
    return NextResponse.json({ ok: true, mode: "ADMIN_SCREENER_DEBUG", requestId, market, responseTimeMs: Date.now() - startedAt, counts: { activeUniverse: Number(counts.rows[0]?.active_universe ?? 0), dailyCandles: Number(counts.rows[0]?.daily_candles ?? 0) }, universeBreakdown: breakdown.rows.map((row) => ({ bucket: row.bucket, rowCount: Number(row.row_count), commonStockCount: Number(row.common_stock_count) })), indexes: indexes.rows.map((row) => row.indexname), fundamentalLookupPlan: explain.rows[0]?.['QUERY PLAN'] ?? null }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    console.error("[API /admin/screener-debug] failed:", error instanceof Error ? error.message.slice(0, 500) : "unknown error");
    return NextResponse.json({ ok: false, mode: "ADMIN_SCREENER_DEBUG", requestId, responseTimeMs: Date.now() - startedAt, error: "SCREENER_DEBUG_FAILED" }, { status: 503, headers: { "x-request-id": requestId } });
  }
}
