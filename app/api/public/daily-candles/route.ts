import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const MARKETS = new Set(["KR", "US", "KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"]);
const TIMEFRAMES = new Set(["D", "W", "M"]);
const marketPredicate = "(($1 = 'KR' AND market IN ('KOSPI', 'KOSDAQ')) OR ($1 = 'US' AND market IN ('NAS', 'NYS', 'AMS')) OR market = $1)";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = (params.get("market") ?? "").trim().toUpperCase();
  const code = (params.get("code") ?? "").trim().toUpperCase();
  const codes = (params.get("codes") ?? "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const timeframe = (params.get("timeframe") ?? "D").trim().toUpperCase();
  const parsedLimit = Number(params.get("limit") ?? "120");
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 300) : 0;

  if (!MARKETS.has(market) || (!code && !codes.length) || code.length > 32 || codes.length > 100 || codes.some((value) => value.length > 32) || !TIMEFRAMES.has(timeframe) || !limit) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }

  const table = market === "KR" || market === "KOSPI" || market === "KOSDAQ"
    ? "kr_instrument_universe_candles"
    : "us_instrument_universe_candles";

  try {
    if (codes.length > 0) {
      const result = await getPool().query(`
        SELECT $1::text AS market, requested.code, cached.candle_date, cached.open, cached.high,
               cached.low, cached.close, cached.volume, cached.fetched_at
          FROM unnest($2::text[]) AS requested(code)
          CROSS JOIN LATERAL (
            SELECT candle_date, open, high, low, close, volume, fetched_at
              FROM (
                SELECT candle_date, open, high, low, close, volume, fetched_at,
                       ROW_NUMBER() OVER (PARTITION BY candle_date ORDER BY fetched_at DESC) AS rn
                  FROM ${table}
                 WHERE ${marketPredicate} AND code = requested.code AND timeframe = $3
              ) latest
             WHERE rn = 1
             ORDER BY candle_date DESC
             LIMIT $4
          ) cached
         ORDER BY requested.code, cached.candle_date DESC`,
        [market, codes, timeframe, limit],
      );
      const grouped = new Map<string, { date: string; open: number; high: number; low: number; close: number; volume: number }[]>();
      for (const row of result.rows as Array<Record<string, unknown>>) {
        const values = grouped.get(String(row.code)) ?? [];
        values.push({ date: String(row.candle_date), open: Number(row.open ?? 0), high: Number(row.high ?? 0), low: Number(row.low ?? 0), close: Number(row.close ?? 0), volume: Number(row.volume ?? 0) });
        grouped.set(String(row.code), values);
      }
      return NextResponse.json({ ok: true, source: "OPERATING_DB_CACHE", market, timeframe, items: codes.map((itemCode) => ({ code: itemCode, candles: (grouped.get(itemCode) ?? []).reverse() })) }, { headers: { "cache-control": "no-store" } });
    }
    const result = await getPool().query<{
      candle_date: string;
      open: string | number | null;
      high: string | number | null;
      low: string | number | null;
      close: string | number | null;
      volume: string | number | null;
      fetched_at: Date | string | null;
    }>(
      `SELECT candle_date, open, high, low, close, volume, fetched_at
         FROM (
           SELECT candle_date, open, high, low, close, volume, fetched_at,
                  ROW_NUMBER() OVER (PARTITION BY candle_date ORDER BY fetched_at DESC) AS rn
             FROM ${table}
            WHERE ${marketPredicate} AND code = $2 AND timeframe = $3
         ) latest
        WHERE rn = 1
        ORDER BY candle_date DESC
        LIMIT $4`,
      [market, code, timeframe, limit],
    );

    const candles = result.rows.map((row) => ({
      date: String(row.candle_date),
      open: Number(row.open ?? 0),
      high: Number(row.high ?? 0),
      low: Number(row.low ?? 0),
      close: Number(row.close ?? 0),
      volume: Number(row.volume ?? 0),
    })).reverse();
    const fetchedAt = result.rows.reduce<string | null>((latest, row) => {
      if (!row.fetched_at) return latest;
      const value = new Date(row.fetched_at).toISOString();
      return !latest || value > latest ? value : latest;
    }, null);

    return NextResponse.json({
      ok: true,
      source: "OPERATING_DB_CACHE",
      market,
      code,
      timeframe,
      candles,
      metadata: {
        latestCandleDate: candles.at(-1)?.date ?? null,
        dataUpdatedAt: fetchedAt,
        returnedCount: candles.length,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /public/daily-candles] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "DAILY_CACHE_UNAVAILABLE" }, { status: 503 });
  }
}
