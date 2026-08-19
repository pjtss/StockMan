import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { usDailyPriceCandles, usInstrumentUniverseCandles } from "@/lib/schema";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { fetchUsDailyPrice, type UsDailyPriceResponse } from "@/lib/kis-us-daily-price";

const memoryCache = new Map<string, { expiresAt: number; candles: UsDailyCandle[] }>();
const MEMORY_TTL_MS = 60_000;
const BULK_CACHE_CANDLE_LIMIT = 100;
const bulkInflight = new Map<string, Promise<Map<string, UsDailyCandle[]>>>();

export async function loadCachedUsDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit = 10, timeframe = "D") {
  const normalized = Array.from(new Map(items.map((item) => {
    const value = { market: item.market.trim().toUpperCase(), code: item.code.trim().toUpperCase() };
    return [`${value.market}:${value.code}`, value] as const;
  })).values());
  const result = new Map<string, UsDailyCandle[]>();
  const missing: typeof normalized = [];
  for (const item of normalized) {
    const key = `${item.market}:${item.code}`;
    const memory = timeframe === "D" ? memoryCache.get(key) : undefined;
    if (memory && memory.expiresAt > Date.now() && memory.candles.length >= limit) result.set(key, memory.candles.slice(0, limit));
    else missing.push(item);
  }
  if (missing.length === 0) return result;
  const db = getDb();
  if (!db) return result;
  const batchKey = missing.map((item) => `${item.market}:${item.code}`).sort().join("|");
  let request = bulkInflight.get(batchKey);
  if (!request) {
    const fetchLimit = Math.max(limit, BULK_CACHE_CANDLE_LIMIT);
    request = (async () => {
      const grouped = new Map<string, UsDailyCandle[]>();
      // Join against a VALUES list so PostgreSQL can use the composite
      // (market, code, timeframe, date) index. A giant OR expression regresses
      // to a sequential scan for the 400+ ticker weekly universe.
      const params: unknown[] = [];
      const values = missing.map((item, index) => {
        const marketParam = index * 2 + 1;
        const codeParam = marketParam + 1;
        params.push(item.market, item.code);
        return `($${marketParam}, $${codeParam})`;
      }).join(", ");
      params.push(timeframe, fetchLimit);
      const timeframeParam = params.length - 1;
      const limitParam = params.length;
      const query = `SELECT c.market, c.code, c.candle_date, c.open, c.high, c.low, c.close, c.volume, c.source
        FROM (
          SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.market, c.code ORDER BY c.candle_date DESC) AS row_number
          FROM us_instrument_universe_candles c
          JOIN (VALUES ${values}) AS v(market, code)
            ON c.market = v.market AND c.code = v.code
          WHERE c.timeframe = $${timeframeParam}
        ) c
        WHERE c.row_number <= $${limitParam}
        ORDER BY c.candle_date DESC`;
      const rows = (await getPool().query(query, params)).rows;
      for (const row of rows) {
        const key = `${row.market}:${row.code}`;
        const candles = grouped.get(key) ?? [];
        if (candles.length < fetchLimit) candles.push({ date: row.candle_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), raw: { source: row.source, cached: true } });
        grouped.set(key, candles);
      }
      return grouped;
    })();
    bulkInflight.set(batchKey, request);
  }
  let grouped: Map<string, UsDailyCandle[]>;
  try {
    grouped = await request;
  } finally {
    if (bulkInflight.get(batchKey) === request) bulkInflight.delete(batchKey);
  }
  for (const item of missing) {
    const key = `${item.market}:${item.code}`;
    const candles = grouped.get(key) ?? [];
    result.set(key, candles.slice(0, limit));
    memoryCache.set(key, { expiresAt: Date.now() + MEMORY_TTL_MS, candles });
  }
  return result;
}

export async function loadCachedUsDailyCandles(market: string, code: string, limit = 10, timeframe = "D"): Promise<UsDailyCandle[]> {
  const cacheKey = `${market}:${code}`;
  const memory = timeframe === "D" ? memoryCache.get(cacheKey) : undefined;
  if (memory && memory.expiresAt > Date.now() && memory.candles.length >= limit) return memory.candles.slice(0, limit);
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(usInstrumentUniverseCandles).where(and(eq(usInstrumentUniverseCandles.market, market), eq(usInstrumentUniverseCandles.code, code), eq(usInstrumentUniverseCandles.timeframe, timeframe))).orderBy(desc(usInstrumentUniverseCandles.candleDate)).limit(limit);
    const candles = rows.map((row) => ({ date: row.candleDate, open: row.open ?? 0, high: row.high ?? 0, low: row.low ?? 0, close: row.close ?? 0, volume: row.volume ?? 0, raw: { source: row.source, cached: true } }));
  memoryCache.set(cacheKey, { expiresAt: Date.now() + MEMORY_TTL_MS, candles });
  return candles.slice(0, limit);
}

export async function saveUsDailyCandles(market: string, code: string, candles: UsDailyCandle[], timeframe = "D") {
  const db = getDb();
  if (!db || candles.length === 0) return 0;
  await db.insert(usInstrumentUniverseCandles).values(candles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, source: "KIS" }))).onConflictDoUpdate({ target: [usInstrumentUniverseCandles.market, usInstrumentUniverseCandles.code, usInstrumentUniverseCandles.timeframe, usInstrumentUniverseCandles.candleDate], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, source: sql`excluded.source`, fetchedAt: new Date() } });
  memoryCache.delete(`${market}:${code}`);
  return candles.length;
}

/** Returns the cached historical daily series and calls KIS only when history is insufficient. */
export async function fetchUsDailyPriceCached(request: { code: string; market: string; endDate?: string }, minimumCandles = 35): Promise<UsDailyPriceResponse | null> {
  const cached = await loadCachedUsDailyCandles(request.market.trim().toUpperCase(), request.code.trim().toUpperCase(), 100).catch(() => []);
  if (cached.length >= minimumCandles) {
    return { ok: true, status: 200, request: { method: "GET", url: "db://us_daily_price_candles", headers: {} }, response: { rawText: "", parsed: null }, candles: cached, diagnostics: { source: "DB_CACHE", httpStatus: 200, kisOk: true, rtCd: "0", msgCd: "DB_CACHE", msg1: "DB cached daily candles", outputKey: null, rawOutputCount: cached.length, parsedCandleCount: cached.length, firstDate: cached.at(-1)?.date ?? null, lastDate: cached[0]?.date ?? null } };
  }
  const fresh = await fetchUsDailyPrice(request);
  if (fresh?.ok && fresh.candles.length > 0) await saveUsDailyCandles(request.market.trim().toUpperCase(), request.code.trim().toUpperCase(), fresh.candles).catch(() => undefined);
  return fresh;
}
