import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { isValidCompactCalendarDate } from "@/lib/calendar-date-quality.mjs";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL } from "@/lib/us-depositary-receipt-classification";

export const dynamic = "force-dynamic";

type DailyCandle = { date: string; open: number; high: number; low: number; close: number; volume: number; tradingValue: number };

function validDailyCandle(candle: DailyCandle) {
  const date = String(candle.date ?? "");
  return isValidCompactCalendarDate(date)
    && [candle.open, candle.high, candle.low, candle.close, candle.volume, candle.tradingValue].every(Number.isFinite)
    && Math.min(candle.open, candle.high, candle.low, candle.close) > 0
    && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.low, candle.close)
    && candle.low <= Math.min(candle.open, candle.high, candle.close);
}

const MARKETS = new Set(["KR", "US", "KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"]);
const TIMEFRAMES = new Set(["D", "W", "M"]);
const marketPredicate = "(($1 = 'KR' AND u.market IN ('KOSPI', 'KOSDAQ')) OR ($1 = 'US' AND u.market IN ('NAS', 'NYS', 'AMS')) OR u.market = $1)";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = (params.get("market") ?? "").trim().toUpperCase();
  const code = (params.get("code") ?? "").trim().toUpperCase();
  const codes = (params.get("codes") ?? "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const universe = params.get("universe") === "true";
  const offset = Number(params.get("offset") ?? "0");
  const pageSize = Number(params.get("pageSize") ?? "100");
  const timeframe = (params.get("timeframe") ?? "D").trim().toUpperCase();
  const parsedLimit = Number(params.get("limit") ?? "120");
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 300) : 0;

  if (!MARKETS.has(market) || (!universe && !code && !codes.length) || (universe && (code || codes.length || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) || code.length > 32 || codes.length > 100 || codes.some((value) => value.length > 32) || !TIMEFRAMES.has(timeframe) || !limit) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }

  const isKrMarket = market === "KR" || market === "KOSPI" || market === "KOSDAQ";
  const dailyTradingValueSql = "COALESCE(c.trading_value, c.close * c.volume)";
  const table = isKrMarket
    ? "kr_instrument_universe_candles"
    : "us_instrument_universe_candles";
  const universeTable = isKrMarket
    ? "kr_common_stock_universe"
    : "us_common_stock_universe";
  const stockEligibility = isKrMarket
    ? "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false"
    : `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL}`;

  try {
    if (universe) {
      const result = await getPool().query(`SELECT u.market, u.code, u.name FROM ${universeTable} u WHERE ${marketPredicate} AND ${stockEligibility} ORDER BY u.market, u.code LIMIT $2 OFFSET $3`, [market, pageSize, offset]);
      const totalResult = await getPool().query(`SELECT COUNT(*)::int AS total FROM ${universeTable} u WHERE ${marketPredicate} AND ${stockEligibility}`, [market]);
      const total = Number(totalResult.rows[0]?.total ?? 0);
      const nextOffset = offset + result.rows.length < total ? offset + result.rows.length : null;
      return NextResponse.json({ ok: true, source: "OPERATING_OFFICIAL_UNIVERSE", market, items: result.rows.map((row) => ({ market: row.market, code: row.code, name: row.name })), page: { offset, pageSize, total, nextOffset } }, { headers: { "cache-control": "no-store" } });
    }
    if (codes.length > 0) {
      const result = await getPool().query(`
        SELECT u.market, requested.code, u.name, cached.candle_date, cached.open, cached.high,
               cached.low, cached.close, cached.volume, cached.trading_value, cached.fetched_at
          FROM unnest($2::text[]) AS requested(code)
          JOIN ${universeTable} u ON u.code=requested.code AND ${marketPredicate} AND ${stockEligibility}
          CROSS JOIN LATERAL (
            SELECT candle_date, open, high, low, close, volume, trading_value, fetched_at
              FROM (
                SELECT c.market, c.candle_date, c.open, c.high, c.low, c.close, c.volume, ${dailyTradingValueSql} AS trading_value, c.fetched_at,
                       ROW_NUMBER() OVER (PARTITION BY c.candle_date ORDER BY c.fetched_at DESC) AS rn
                  FROM ${table} c
                 WHERE c.market=u.market AND c.code = requested.code AND c.timeframe = $3
                   AND ${validDailyCandleSql("c")}
              ) latest
             WHERE rn = 1
             ORDER BY candle_date DESC
             LIMIT $4
          ) cached
         ORDER BY requested.code, cached.candle_date DESC`,
        [market, codes, timeframe, limit],
      );
      const grouped = new Map<string, { market: string; code: string; name: string; candles: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; tradingValue: number; fetchedAt: string }> }>();
      for (const row of result.rows as Array<Record<string, unknown>>) {
        const itemCode = String(row.code);
        const itemMarket = String(row.market);
        const key = `${itemMarket}:${itemCode}`;
        const item = grouped.get(key) ?? { market: itemMarket, code: itemCode, name: String(row.name ?? ""), candles: [] };
        const candle = { date: String(row.candle_date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), tradingValue: Number(row.trading_value ?? Number(row.close) * Number(row.volume)) };
        if (validDailyCandle(candle) && row.fetched_at) item.candles.push({ ...candle, fetchedAt: new Date(row.fetched_at as string | Date).toISOString() });
        grouped.set(key, item);
      }
      return NextResponse.json({ ok: true, source: "OPERATING_DB_CACHE", market, timeframe, items: codes.flatMap((itemCode) => {
        return [...grouped.values()].filter((item) => item.code === itemCode).map((item) => {
          const candles = item.candles.reverse();
          return { market: item.market, code: itemCode, name: item.name, candles, metadata: { latestCandleDate: candles.at(-1)?.date ?? null, dataUpdatedAt: candles.reduce<string | null>((latest, candle) => !latest || candle.fetchedAt > latest ? candle.fetchedAt : latest, null), returnedCount: candles.length } };
        });
      }) }, { headers: { "cache-control": "no-store" } });
    }
    const result = await getPool().query<{
      market: string;
      name: string;
      candle_date: string;
      open: string | number | null;
      high: string | number | null;
      low: string | number | null;
      close: string | number | null;
      volume: string | number | null;
      trading_value: string | number | null;
      fetched_at: Date | string | null;
    }>(
      `SELECT u.market, u.name, latest.candle_date, latest.open, latest.high, latest.low, latest.close, latest.volume, latest.trading_value, latest.fetched_at
         FROM ${universeTable} u
         LEFT JOIN LATERAL (
           SELECT candle_date, open, high, low, close, volume, trading_value, fetched_at
             FROM (
           SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume, ${dailyTradingValueSql} AS trading_value, c.fetched_at,
                  ROW_NUMBER() OVER (PARTITION BY c.candle_date ORDER BY c.fetched_at DESC) AS rn
             FROM ${table} c
            WHERE c.market=u.market AND c.code = u.code AND c.timeframe = $3
              AND ${validDailyCandleSql("c")}
           ) latest
            WHERE rn=1
            ORDER BY candle_date DESC
            LIMIT $4
         ) latest ON TRUE
        WHERE ${marketPredicate} AND u.code = $2 AND ${stockEligibility}
        ORDER BY u.market, latest.candle_date DESC`,
      [market, code, timeframe, limit],
    );

    const exchanges = [...new Set(result.rows.map((row) => row.market))].sort();
    if (exchanges.length > 1) {
      return NextResponse.json({ ok: false, error: "AMBIGUOUS_INSTRUMENT", market, code, timeframe, exchanges }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const candles = result.rows.map((row) => ({
      date: String(row.candle_date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      tradingValue: Number(row.trading_value ?? Number(row.close) * Number(row.volume)),
      fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : null,
    })).filter(validDailyCandle).reverse();
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
      instrument: { market: result.rows[0]?.market ?? null, code, name: result.rows[0]?.name ?? null },
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
