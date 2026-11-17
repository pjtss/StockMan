import { and, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { krCommonStockUniverse, krInstrumentUniverseCandles } from "@/lib/schema";
import type { OHLCVCandle } from "@/lib/kis-chart";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";
import { loadRemoteDailyCandlesBulk } from "@/lib/remote-daily-candle-cache";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { isValidCompactCalendarDate } from "./calendar-date-quality.mjs";

export type CandleTimeframe = "D" | "W" | "M";

const bulkInflight = new Map<string, Promise<Map<string, OHLCVCandle[]>>>();

function isValidCachedCandle(candle: OHLCVCandle) {
  const date = String(candle.date ?? "");
  return isValidCompactCalendarDate(date)
    && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && Math.min(candle.open, candle.high, candle.low, candle.close) > 0
    && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.low, candle.close)
    && candle.low <= Math.min(candle.open, candle.high, candle.close);
}

function normalizeCachedCandles(candles: OHLCVCandle[], limit: number) {
  return Array.from(new Map(candles.filter(isValidCachedCandle).map((candle) => [candle.date, candle])).values())
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}

async function loadCachedKrDailyCandlesBulkUncached(items: Array<{ market: string; code: string }>, limit = 100, timeframe: CandleTimeframe = "D") {
  const result = new Map<string, OHLCVCandle[]>();
  if (!items.length) return result;
  const normalized = Array.from(new Map(items.map((item) => [`${item.market}:${item.code}`, { market: item.market, code: item.code }])).values());
  const params: unknown[] = [];
  const values = normalized.map((item, index) => { const marketParam = index * 2 + 1; params.push(item.market, item.code); return `($${marketParam}, $${marketParam + 1})`; }).join(",");
  params.push(timeframe, limit);
  const timeframeParam = params.length - 1;
  const limitParam = params.length;
  const rows = (await getPool().query(`SELECT v.market, v.code, c.candle_date AS "candleDate", c.open, c.high, c.low, c.close, c.volume, c.fetched_at AS "fetchedAt"
    FROM (VALUES ${values}) AS v(market, code)
    CROSS JOIN LATERAL (SELECT candle_date, open, high, low, close, volume, fetched_at
      FROM kr_instrument_universe_candles c
      WHERE c.market = v.market AND c.code = v.code AND c.timeframe = $${timeframeParam}
        AND ${validDailyCandleSql("c")}
      ORDER BY c.candle_date DESC LIMIT $${limitParam}) c
    ORDER BY v.market, v.code, c.candle_date DESC`, params)).rows;
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    const candles = result.get(key) ?? [];
    const candle = { date: String(row.candleDate), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), fetchedAt: row.fetchedAt ? new Date(row.fetchedAt).toISOString() : null };
    if (candles.length < limit && isValidCachedCandle(candle)) candles.push(candle);
    result.set(key, candles);
  }
  for (const [key, candles] of result) result.set(key, normalizeCachedCandles(candles, limit));
  return result;
}

export async function loadCachedKrDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit = 100, timeframe: CandleTimeframe = "D") {
  const normalizedKey = Array.from(new Set(items.map((item) => `${item.market.trim().toUpperCase()}:${item.code.trim().toUpperCase()}`))).sort().join("|");
  if (!normalizedKey) return new Map<string, OHLCVCandle[]>();
  if (process.env.DAILY_CACHE_API_URL?.trim()) {
    const remote = await loadRemoteDailyCandlesBulk(items, limit, timeframe);
    if (!remote) throw new Error(`REMOTE_DAILY_CANDLE_BULK_UNAVAILABLE:${timeframe}:${items.length}`);
    return remote;
  }
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
  // KIS can occasionally return repeated dates (or malformed numeric fields).
  // PostgreSQL rejects a single INSERT ... ON CONFLICT that targets the same
  // key twice, so normalize the batch before opening the transaction.
  const byDate = new Map<string, OHLCVCandle>();
  for (const candle of candles) {
    const date = String(candle.date ?? "");
    const calendarDateIsValid = isValidCompactCalendarDate(date);
    const rawValues: unknown[] = [candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (rawValues.some((value) => value === null || value === undefined || value === "")) continue;
    const values = [candle.open, candle.high, candle.low, candle.close, candle.volume].map(Number);
    if (!calendarDateIsValid || values.some((value) => !Number.isFinite(value)) ||
      values[0] <= 0 || values[1] <= 0 || values[2] <= 0 || values[3] <= 0 || values[4] < 0 ||
      values[1] < Math.max(values[0], values[2], values[3]) || values[2] > Math.min(values[0], values[1], values[3])) continue;
    byDate.set(date, { ...candle, date, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4] });
  }
  const validCandles = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!validCandles.length) return 0;
  const db = getDb();
  if (!options.skipUniverseCheck) {
    const common = await db.select({ code: krCommonStockUniverse.code }).from(krCommonStockUniverse).where(and(
      eq(krCommonStockUniverse.market, market),
      eq(krCommonStockUniverse.code, code),
      eq(krCommonStockUniverse.enabled, true),
      eq(krCommonStockUniverse.instrumentType, "COMMON_STOCK"),
      eq(krCommonStockUniverse.isEtp, false),
      eq(krCommonStockUniverse.isWarrant, false),
      eq(krCommonStockUniverse.isPreferred, false),
      eq(krCommonStockUniverse.isSuspended, false),
      sql`COALESCE(${krCommonStockUniverse.tradingHaltCode}, '') NOT IN ('Y','1')`,
      sql`COALESCE(${krCommonStockUniverse.liquidationCode}, '') NOT IN ('Y','1')`,
      sql`COALESCE(${krCommonStockUniverse.managedIssueCode}, '') <> 'Y'`,
    )).limit(1);
    if (!common.length) return 0;
  }
  const savedCandleCount = await db.transaction(async (tx) => {
    const savedRows = await tx.insert(krInstrumentUniverseCandles).values(validCandles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, candleTime: null, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, rawPayload: JSON.stringify(candle.raw ?? {}), source: "KIS" }))).onConflictDoUpdate({ target: [krInstrumentUniverseCandles.market, krInstrumentUniverseCandles.code, krInstrumentUniverseCandles.timeframe, krInstrumentUniverseCandles.candleDate], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, rawPayload: sql`excluded.raw_payload`, fetchedAt: new Date() } }).returning({ candleDate: krInstrumentUniverseCandles.candleDate });
    const savedDates = new Set(savedRows.map((row) => row.candleDate));
    if (savedRows.length !== validCandles.length || validCandles.some((candle) => !savedDates.has(candle.date))) {
      throw new Error(`KR candle UPSERT verification mismatch: market=${market} code=${code} timeframe=${timeframe} expected=${validCandles.length} returned=${savedRows.length}`);
    }
    if (timeframe === "D") {
      await tx.execute(sql`DELETE FROM kr_latest_daily_candles s WHERE s.market = ${market} AND s.code = ${code} AND NOT ${sql.raw(validDailyCandleSql("s"))}`);
      await tx.execute(sql`INSERT INTO kr_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at)
        SELECT c.market, c.code, c.candle_date, c.open, c.high, c.low, c.close, c.volume, NOW()
          FROM kr_instrument_universe_candles c
         WHERE c.market = ${market} AND c.code = ${code} AND c.timeframe = 'D'
           AND ${sql.raw(validDailyCandleSql("c"))}
         ORDER BY c.candle_date DESC, c.fetched_at DESC LIMIT 1
        ON CONFLICT (market, code) DO UPDATE SET candle_date=excluded.candle_date, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, fetched_at=excluded.fetched_at`);
      const latest = [...validCandles].sort((a, b) => b.date.localeCompare(a.date))[0];
      const latestVolume = latest.volume;
      await tx.execute(sql`UPDATE kr_common_stock_universe SET enabled = ${latestVolume > 0}, updated_at = NOW()
        WHERE market = ${market} AND code = ${code} AND instrument_type = 'COMMON_STOCK'
          AND COALESCE(is_suspended, false) = false AND COALESCE(trading_halt_code, '') NOT IN ('Y','1')
          AND COALESCE(liquidation_code, '') NOT IN ('Y','1') AND COALESCE(managed_issue_code, '') <> 'Y'
          AND NOT EXISTS (
            SELECT 1 FROM kr_instrument_universe_candles existing
            WHERE existing.market = ${market} AND existing.code = ${code} AND existing.timeframe = 'D'
              AND existing.candle_date > ${latest.date}
          )`);
    }
    return savedRows.length;
  });
  return savedCandleCount;
}

export async function refreshKrDailyCandles(code: string, timeframe: CandleTimeframe = "D", market = "KOSPI", options: { skipUniverseCheck?: boolean } = {}) {
  const response = await fetchKrDailyPrice({ code, timeframe });
  if (response?.ok && response.candles.length) {
    const savedCandleCount = await saveKrDailyCandles(market, code, response.candles, timeframe, options);
    response.diagnostics.savedCandleCount = savedCandleCount;
    response.diagnostics.discardedOrDuplicateCandleCount = Math.max(0, response.candles.length - savedCandleCount);
    if (savedCandleCount === 0) response.diagnostics.error = "NO_CANDLES_SAVED";
  } else if (response) {
    response.diagnostics.savedCandleCount = 0;
    response.diagnostics.discardedOrDuplicateCandleCount = response.candles.length;
  }
  return response;
}
