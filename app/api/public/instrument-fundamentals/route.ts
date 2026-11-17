import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = (params.get("market") ?? "").trim().toUpperCase();
  const codes = (params.get("codes") ?? "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const config = MARKET_CONFIGS[market];
  if (!config || !codes.length || codes.length > 100 || codes.some((code) => code.length > 32)) return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  try {
    const result = await getPool().query(`SELECT f.market, f.code, u.name, f.price, f.change_rate, f.open, f.high, f.low, f.volume, f.trading_value, f.market_cap, f.listed_shares, f.currency, f.source, f.observed_at, f.fetched_at FROM instrument_fundamental_snapshots f JOIN ${config.universeTable} u ON u.market=f.market AND u.code=f.code WHERE u.market = ANY($1::text[]) AND f.code = ANY($2::text[]) AND ${config.stockEligibility}`, [config.markets, codes]);
    return NextResponse.json({ ok: true, source: "OPERATING_DB_FUNDAMENTAL_SNAPSHOT", market, items: result.rows.map((row) => ({ market: row.market, code: row.code, name: row.name, price: row.price, changeRate: row.change_rate, open: row.open, high: row.high, low: row.low, volume: row.volume, tradingValue: row.trading_value, marketCap: row.market_cap, listedShares: row.listed_shares, currency: row.currency, source: row.source, observedAt: row.observed_at, fetchedAt: row.fetched_at })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /public/instrument-fundamentals] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FUNDAMENTALS_UNAVAILABLE" }, { status: 503 });
  }
}
