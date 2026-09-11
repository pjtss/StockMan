import { and, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { krCommonStockUniverse, krInstrumentUniverseCandles } from "@/lib/schema";
import type { OHLCVCandle } from "@/lib/kis-chart";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";

export type CandleTimeframe = "D" | "W" | "M";

const bulkInflight = new Map<string, Promise<Map<string, OHLCVCandle[]>>>();

async function loadCachedKrDailyCandlesBulkUncached(items: Array<{ market: string; code: string }>, limit = 100, timeframe: CandleTimeframe = "D") {
  const result = new Map<string, OHLCVCandle[]>();
  if (!items.length) return result;
  const normalized = Array.from(new Map(items.map((item) => [`${item.market}:${item.code}`, { market: item.market, code: item.code }])).values());
  const params: unknown[] = [];
  const values = normalized.map((item, index) => { const marketParam = index * 2 + 1; params.push(item.market, item.code); return `($${marketParam}, $${marketParam + 1})`; }).join(",");
  params.push(timeframe, limit);
  const timeframeParam = params.length - 1;
  const limitParam = params.length;
  const rows = (await getPool().query(`SELECT v.market, v.code, c.candle_date, c.open, c.high, c.low, c.close, c.volume
    FROM (VALUES ${values}) AS v(market, code)
    CROSS JOIN LATERAL (SELECT candle_date, open, high, low, close, volume
      FROM kr_instrument_universe_candles c
      WHERE c.market = v.market AND c.code = v.code AND c.timeframe = $${timeframeParam}
      ORDER BY c.candle_date DESC LIMIT $${limitParam}) c
    ORDER BY v.market, v.code, c.candle_date DESC`, params)).rows;
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    const candles = result.get(key) ?? [];
    if (candles.length < limit) candles.push({ date: row.candleDate, open: row.open ?? 0, high: row.high ?? 0, low: row.low ?? 0, close: row.close ?? 0, volume: row.volume ?? 0 });
    result.set(key, candles);
  }
  return result;
}

export async function loadCachedKrDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit = 100, timeframe: CandleTimeframe = "D") {
  const normalizedKey = Array.from(new Set(items.map((item) => `${item.market.trim().toUpperCase()}:${item.code.trim().toUpperCase()}`))).sort().join("|");
  if (!normalizedKey) return new Map<string, OHLCVCandle[]>();
  const key = `${timeframe}:${limit}:${normalizedKey}`;
  const existing = bulkInflight.get(key);
  if (existing) return existing;
  const request = loadCachedKrDailyCandlesBulkUncached(items, limit, timeframe);
  bulkInflight.set(key, request);
  try {
    return await request;
  } finally {
    if (bulkInflight.get(key) === request) bulkInflight.delete(key);
  }
}

export async function saveKrDailyCandles(market: string, code: string, candles: OHLCVCandle[], timeframe: CandleTimeframe = "D", options: { skipUniverseCheck?: boolean } = {}) {
  if (!candles.length) return 0;
  const db = getDb();
  if (!options.skipUniverseCheck) {
    const common = await db.select({ code: krCommonStockUniverse.code }).from(krCommonStockUniverse).where(and(eq(krCommonStockUniverse.market, market), eq(krCommonStockUniverse.code, code), eq(krCommonStockUniverse.enabled, true))).limit(1);
    if (!common.length) return 0;
  }
  await db.transaction(async (tx) => {
    await tx.insert(krInstrumentUniverseCandles).values(candles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, candleTime: null, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, rawPayload: JSON.stringify(candle.raw ?? {}), source: "KIS" }))).onConflictDoUpdate({ target: [krInstrumentUniverseCandles.market, krInstrumentUniverseCandles.code, krInstrumentUniverseCandles.timeframe, krInstrumentUniverseCandles.candleDate], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, rawPayload: sql`excluded.raw_payload`, fetchedAt: new Date() } });
    if (timeframe === "D") {
    const latest = [...candles].filter((c) => Number(c.volume ?? 0) > 0 && Number.isFinite(c.close)).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (latest) await tx.execute(sql`INSERT INTO kr_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at) VALUES (${market}, ${code}, ${latest.date}, ${latest.open}, ${latest.high}, ${latest.low}, ${latest.close}, ${latest.volume}, NOW()) ON CONFLICT (market, code) DO UPDATE SET candle_date=excluded.candle_date, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, fetched_at=excluded.fetched_at WHERE kr_latest_daily_candles.candle_date <= excluded.candle_date`);
  }
  if (timeframe === "D") {
    const latest = [...candles].sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestVolume = Number(latest?.volume ?? 0);
      await tx.execute(sql`UPDATE kr_common_stock_universe SET enabled = ${latestVolume > 0}, updated_at = NOW() WHERE market = ${market} AND code = ${code} AND instrument_type = 'COMMON_STOCK' AND COALESCE(is_suspended, false) = false AND COALESCE(trading_halt_code, '') NOT IN ('Y','1') AND COALESCE(liquidation_code, '') NOT IN ('Y','1') AND COALESCE(managed_issue_code, '') <> 'Y'`);
    }
  });
  return candles.length;
}

export async function refreshKrDailyCandles(code: string, timeframe: CandleTimeframe = "D", market = "KOSPI", options: { skipUniverseCheck?: boolean } = {}) {
  const response = await fetchKrDailyPrice({ code, timeframe });
  if (response?.ok && response.candles.length) await saveKrDailyCandles(market, code, response.candles, timeframe, options);
  return response;
}
