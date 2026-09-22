import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.DAILY_CACHE_READ_API_KEY?.trim();
  const supplied = request.headers.get("x-daily-cache-key")?.trim() || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const market = (params.get("market") ?? "").trim().toUpperCase();
  const codes = (params.get("codes") ?? "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!market || !codes.length || codes.length > 100 || codes.some((code) => code.length > 32)) return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  try {
    const result = await getPool().query(`SELECT market, code, name, price, change_rate, open, high, low, volume, trading_value, market_cap, shares_outstanding, free_float_shares, free_float_percent, currency, source, observed_at, fetched_at FROM instrument_fundamental_snapshots WHERE market = $1 AND code = ANY($2::text[])`, [market, codes]);
    return NextResponse.json({ ok: true, source: "OPERATING_DB_FUNDAMENTAL_SNAPSHOT", market, items: result.rows.map((row) => ({ market: row.market, code: row.code, name: row.name, price: row.price, changeRate: row.change_rate, open: row.open, high: row.high, low: row.low, volume: row.volume, tradingValue: row.trading_value, marketCap: row.market_cap, sharesOutstanding: row.shares_outstanding, freeFloatShares: row.free_float_shares, freeFloatPercent: row.free_float_percent, currency: row.currency, source: row.source, observedAt: row.observed_at, fetchedAt: row.fetched_at })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /public/instrument-fundamentals] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FUNDAMENTALS_UNAVAILABLE" }, { status: 503 });
  }
}
