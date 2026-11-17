import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { usCommonStockUniverse, usInstrumentUniverseCandles } from "@/lib/schema";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { fetchUsDailyPrice, type UsDailyPriceResponse } from "@/lib/kis-us-daily-price";
import { loadRemoteDailyCandlesBulk } from "@/lib/remote-daily-candle-cache";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { isValidCompactCalendarDate } from "./calendar-date-quality.mjs";

const memoryCache = new Map<string, { expiresAt: number; candles: UsDailyCandle[] }>();
const MEMORY_TTL_MS = 60_000;
const BULK_CACHE_CANDLE_LIMIT = 100;
const bulkInflight = new Map<string, Promise<Map<string, UsDailyCandle[]>>>();
const cacheKeyFor = (market: string, code: string, timeframe: string) => `${market.trim().toUpperCase()}:${code.trim().toUpperCase()}:${normalizeTimeframe(timeframe)}`;

function isValidCachedCandle(candle: UsDailyCandle) {
  const date = String(candle.date ?? "");
  return isValidCompactCalendarDate(date)
    && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && Math.min(candle.open, candle.high, candle.low, candle.close) > 0
    && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.low, candle.close)
    && candle.low <= Math.min(candle.open, candle.high, candle.close);
}

function normalizeCachedCandles(candles: UsDailyCandle[], limit: number) {
  return Array.from(new Map(candles.filter(isValidCachedCandle).map((candle) => [candle.date, candle])).values())
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}

function normalizeTimeframe(timeframe: string) {
  const value = timeframe.trim().toUpperCase();
  if (value === "1D" || value === "DAY" || value === "DAILY") return "D";
  if (value === "1W" || value === "WEEK" || value === "WEEKLY") return "W";
  if (value === "1M" || value === "MONTH" || value === "MONTHLY") return "M";
  return value;
}

export async function loadCachedUsDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit = 10, timeframe = "D") {
  timeframe = normalizeTimeframe(timeframe);
  const normalized = Array.from(new Map(items.map((item) => {
    const value = { market: item.market.trim().toUpperCase(), code: item.code.trim().toUpperCase() };
    return [`${value.market}:${value.code}`, value] as const;
  })).values());
  const result = new Map<string, UsDailyCandle[]>();
  if (process.env.DAILY_CACHE_API_URL?.trim()) {
    const remote = await loadRemoteDailyCandlesBulk(normalized, limit, timeframe as "D" | "W" | "M");
    if (!remote) {
      if (normalized.length === 0) return result;
      throw new Error(`REMOTE_DAILY_CANDLE_BULK_UNAVAILABLE:${timeframe}:${normalized.length}`);
    }
    for (const item of normalized) result.set(`${item.market}:${item.code}`, normalizeCachedCandles((remote.get(`${item.market}:${item.code}`) ?? []) as UsDailyCandle[], limit));
    return result;
  }
  const missing: typeof normalized = [];
  for (const item of normalized) {
    const key = `${item.market}:${item.code}`;
    const memory = timeframe === "D" ? memoryCache.get(cacheKeyFor(item.market, item.code, timeframe)) : undefined;
    if (memory && memory.expiresAt > Date.now() && memory.candles.length >= limit) result.set(key, memory.candles.slice(0, limit));
    else missing.push(item);
  }
  if (missing.length === 0) return result;
  const db = getDb();
  if (!db) throw new Error(`US_DAILY_CANDLE_CACHE_DATABASE_UNAVAILABLE:${timeframe}:${missing.length}`);
  const fetchLimit = Math.max(limit, BULK_CACHE_CANDLE_LIMIT);
  const batchKey = `${timeframe}:${fetchLimit}:${missing.map((item) => `${item.market}:${item.code}`).sort().join("|")}`;
  let request = bulkInflight.get(batchKey);
  if (!request) {
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
            AND ${validDailyCandleSql("c")}
        ) c
        WHERE c.row_number <= $${limitParam}
        ORDER BY c.candle_date DESC`;
      const rows = (await getPool().query(query, params)).rows;
      for (const row of rows) {
        const key = `${row.market}:${row.code}`;
        const candles = grouped.get(key) ?? [];
        const candle = { date: row.candle_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), raw: { source: row.source, cached: true } };
        if (candles.length < fetchLimit && isValidCachedCandle(candle)) candles.push(candle);
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
    const candles = normalizeCachedCandles(grouped.get(key) ?? [], fetchLimit);
    result.set(key, candles.slice(0, limit));
    memoryCache.set(cacheKeyFor(item.market, item.code, timeframe), { expiresAt: Date.now() + MEMORY_TTL_MS, candles });
  }
  return result;
}

export async function loadCachedUsDailyCandles(market: string, code: string, limit = 10, timeframe = "D"): Promise<UsDailyCandle[]> {
  timeframe = normalizeTimeframe(timeframe);
  if (process.env.DAILY_CACHE_API_URL?.trim()) {
    const remote = await loadRemoteDailyCandlesBulk([{ market, code }], limit, timeframe as "D" | "W" | "M");
    if (!remote) throw new Error(`REMOTE_DAILY_CANDLE_UNAVAILABLE:${timeframe}:${market}:${code}`);
    return normalizeCachedCandles((remote?.get(`${market.trim().toUpperCase()}:${code.trim().toUpperCase()}`) ?? []) as UsDailyCandle[], limit);
  }
  const cacheKey = cacheKeyFor(market, code, timeframe);
  const memory = memoryCache.get(cacheKey);
  if (memory && memory.expiresAt > Date.now() && memory.candles.length >= limit) return memory.candles.slice(0, limit);
  const db = getDb();
  if (!db) throw new Error(`US_DAILY_CANDLE_CACHE_DATABASE_UNAVAILABLE:${timeframe}:1`);
  const rows = await db.select().from(usInstrumentUniverseCandles).where(and(eq(usInstrumentUniverseCandles.market, market.trim().toUpperCase()), eq(usInstrumentUniverseCandles.code, code.trim().toUpperCase()), eq(usInstrumentUniverseCandles.timeframe, timeframe), sql.raw(validDailyCandleSql("us_instrument_universe_candles")))).orderBy(desc(usInstrumentUniverseCandles.candleDate)).limit(limit);
  const candles = normalizeCachedCandles(rows.map((row) => ({ date: row.candleDate, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), raw: { source: row.source, cached: true } })), limit);
  memoryCache.set(cacheKey, { expiresAt: Date.now() + MEMORY_TTL_MS, candles });
  return candles.slice(0, limit);
}

export async function saveUsDailyCandles(market: string, code: string, candles: UsDailyCandle[], timeframe = "D") {
  market = market.trim().toUpperCase();
  code = code.trim().toUpperCase();
  timeframe = normalizeTimeframe(timeframe);
  const db = getDb();
  if (!db || candles.length === 0) return 0;
  const eligible = await db.select({ code: usCommonStockUniverse.code }).from(usCommonStockUniverse).where(and(
    eq(usCommonStockUniverse.market, market),
    eq(usCommonStockUniverse.code, code),
    eq(usCommonStockUniverse.enabled, true),
    eq(usCommonStockUniverse.instrumentType, "COMMON_STOCK"),
    eq(usCommonStockUniverse.isEtf, false),
    eq(usCommonStockUniverse.isWarrant, false),
    eq(usCommonStockUniverse.isDerivative, false),
    eq(usCommonStockUniverse.isDr, false),
    eq(usCommonStockUniverse.isLeveraged, false),
    eq(usCommonStockUniverse.isInverse, false),
  )).limit(1);
  if (eligible.length === 0) return 0;
  const byDate = new Map<string, UsDailyCandle>();
  for (const candle of candles) {
    const date = String(candle.date ?? "");
    const validDate = isValidCompactCalendarDate(date);
    const rawValues: unknown[] = [candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (rawValues.some((value) => value === null || value === undefined || (typeof value === "string" && value.trim() === ""))) continue;
    const values = rawValues.map(Number);
    if (!validDate || values.some((value) => !Number.isFinite(value)) || values.slice(0, 4).some((value) => value <= 0) || values[4] < 0 ||
      values[1] < Math.max(values[0], values[2], values[3]) || values[2] > Math.min(values[0], values[1], values[3])) continue;
    byDate.set(date, { ...candle, date, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4] });
  }
  const validCandles = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (validCandles.length === 0) return 0;
  const periodEndDate = timeframe === "D" ? null : sql`excluded.candle_date`;
  const savedCandleCount = await db.transaction(async (tx) => {
    const savedRows = await tx.insert(usInstrumentUniverseCandles).values(validCandles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, periodEndDate: timeframe === "D" ? null : candle.date, candleTime: null, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, priceSign: candle.priceSign ?? null, priceDiff: candle.priceDiff ?? null, changeRate: candle.changeRate ?? null, tradingValue: candle.tradingValue ?? null, rawPayload: JSON.stringify(candle.raw ?? {}), source: "KIS" }))).onConflictDoUpdate({ target: [usInstrumentUniverseCandles.market, usInstrumentUniverseCandles.code, usInstrumentUniverseCandles.timeframe, usInstrumentUniverseCandles.candleDate], set: { periodEndDate, open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, priceSign: sql`excluded.price_sign`, priceDiff: sql`excluded.price_diff`, changeRate: sql`excluded.change_rate`, tradingValue: sql`excluded.trading_value`, rawPayload: sql`excluded.raw_payload`, source: sql`excluded.source`, fetchedAt: new Date() } }).returning({ candleDate: usInstrumentUniverseCandles.candleDate });
    const savedDates = new Set(savedRows.map((row) => row.candleDate));
    if (savedRows.length !== validCandles.length || validCandles.some((candle) => !savedDates.has(candle.date))) {
      throw new Error(`US candle UPSERT verification mismatch: market=${market} code=${code} timeframe=${timeframe} expected=${validCandles.length} returned=${savedRows.length}`);
    }
    if (timeframe === "D") {
      await tx.execute(sql`DELETE FROM us_latest_daily_candles s WHERE s.market = ${market} AND s.code = ${code} AND NOT ${sql.raw(validDailyCandleSql("s"))}`);
      await tx.execute(sql`INSERT INTO us_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at)
      SELECT c.market, c.code, c.candle_date, c.open, c.high, c.low, c.close, c.volume, NOW()
        FROM us_instrument_universe_candles c
       WHERE c.market = ${market} AND c.code = ${code} AND c.timeframe = 'D'
         AND ${sql.raw(validDailyCandleSql("c"))}
       ORDER BY c.candle_date DESC, c.fetched_at DESC LIMIT 1
      ON CONFLICT (market, code) DO UPDATE SET candle_date=excluded.candle_date, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, fetched_at=excluded.fetched_at`);
    }
    return savedRows.length;
  });
  memoryCache.delete(cacheKeyFor(market, code, timeframe));
  return savedCandleCount;
}

/** Returns the cached historical daily series and calls KIS only when history is insufficient. */
export async function fetchUsDailyPriceCached(request: { code: string; market: string; endDate?: string }, minimumCandles = 35): Promise<UsDailyPriceResponse | null> {
  let cached: UsDailyCandle[] = [];
  let cacheReadErrorName: string | null = null;
  try {
    cached = await loadCachedUsDailyCandles(request.market.trim().toUpperCase(), request.code.trim().toUpperCase(), 100);
  } catch (error) {
    cacheReadErrorName = error instanceof Error ? error.name : "UnknownError";
  }
  if (cached.length >= minimumCandles) {
    return { ok: true, status: 200, request: { method: "GET", url: "db://us_instrument_universe_candles", headers: {} }, response: { rawText: "", parsed: null }, candles: cached, diagnostics: { source: "DB_CACHE", httpStatus: 200, kisOk: true, rtCd: "0", msgCd: "DB_CACHE", msg1: "DB cached daily candles", outputKey: null, rawOutputCount: cached.length, parsedCandleCount: cached.length, firstDate: cached.at(-1)?.date ?? null, lastDate: cached[0]?.date ?? null } };
  }
  const fresh = await fetchUsDailyPrice(request);
  if (fresh && cacheReadErrorName) {
    fresh.diagnostics.cacheLookup = "FAILED";
    fresh.diagnostics.cacheLookupErrorName = cacheReadErrorName;
  }
  if (fresh?.ok && fresh.candles.length > 0) {
    try {
      const savedCandleCount = await saveUsDailyCandles(request.market.trim().toUpperCase(), request.code.trim().toUpperCase(), fresh.candles);
      fresh.diagnostics.savedCandleCount = savedCandleCount;
      fresh.diagnostics.discardedOrDuplicateCandleCount = Math.max(0, fresh.candles.length - savedCandleCount);
      if (savedCandleCount === 0) fresh.diagnostics.saveError = "NO_CANDLES_SAVED";
    } catch (error) {
      fresh.diagnostics.savedCandleCount = 0;
      fresh.diagnostics.saveError = error instanceof Error ? error.message : String(error);
    }
  }
  return fresh;
}
