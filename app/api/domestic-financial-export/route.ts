import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const exportedAt = new Date().toISOString();
  const rawOnly = new URL(request.url).searchParams.get("format") === "raw";
  const llmFormat = new URL(request.url).searchParams.get("format") === "llm";
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT u.code, u.name, u.market, u.standard_code AS "standardCode",
             f.price, f.change_rate AS "changeRate", f.open, f.high, f.low,
             f.volume, f.trading_value AS "tradingValue", f.market_cap AS "marketCap",
             f.shares_outstanding AS "sharesOutstanding", f.free_float_shares AS "freeFloatShares",
             f.free_float_percent AS "freeFloatPercent", f.currency, f.source,
             f.observed_at AS "observedAt", f.fetched_at AS "fetchedAt",
             f.raw_payload AS "rawPayload",
             d.data AS daily, w.data AS weekly, m.data AS monthly
      FROM kr_instrument_universe u
      LEFT JOIN instrument_fundamental_snapshots f ON f.market = 'KR' AND f.code = u.code
      LEFT JOIN LATERAL (SELECT jsonb_build_object('date', c.candle_date, 'open', c.open, 'high', c.high, 'low', c.low, 'close', c.close, 'volume', c.volume, 'updatedAt', c.fetched_at, 'rawPayload', c.raw_payload) AS data FROM kr_instrument_universe_candles c WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'D' ORDER BY c.candle_date DESC LIMIT 1) d ON true
      LEFT JOIN LATERAL (SELECT jsonb_build_object('date', c.candle_date, 'open', c.open, 'high', c.high, 'low', c.low, 'close', c.close, 'volume', c.volume, 'updatedAt', c.fetched_at, 'rawPayload', c.raw_payload) AS data FROM kr_instrument_universe_candles c WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'W' ORDER BY c.candle_date DESC LIMIT 1) w ON true
      LEFT JOIN LATERAL (SELECT jsonb_build_object('date', c.candle_date, 'open', c.open, 'high', c.high, 'low', c.low, 'close', c.close, 'volume', c.volume, 'updatedAt', c.fetched_at, 'rawPayload', c.raw_payload) AS data FROM kr_instrument_universe_candles c WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'M' ORDER BY c.candle_date DESC LIMIT 1) m ON true
      WHERE u.instrument_type = 'COMMON_STOCK'
      ORDER BY u.market, u.code
    `);
    const items = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      rawPayload: typeof row.rawPayload === "string" ? (() => { try { return JSON.parse(row.rawPayload as string); } catch { return row.rawPayload; } })() : row.rawPayload,
    })).map((item: Record<string, unknown>) => rawOnly ? ({ market: item.market, code: item.code, name: item.name, source: item.source, observedAt: item.observedAt, fetchedAt: item.fetchedAt, rawPayload: item.rawPayload }) : llmFormat ? ({ ...item, rawPayload: item.rawPayload, technical: { daily: item.daily, weekly: item.weekly, monthly: item.monthly } }) : item);
    return new NextResponse(JSON.stringify({ ok: true, format: rawOnly ? "raw" : llmFormat ? "llm" : "normalized", market: "KR", exportedAt, count: items.length, items }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="domestic-financial-${rawOnly ? "raw" : llmFormat ? "llm" : "data"}-${exportedAt.slice(0, 10)}.json"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, exportedAt, error: error instanceof Error ? error.message : "EXPORT_FAILED" }, { status: 500 });
  }
}
