import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usDailyPriceCandles } from "@/lib/schema";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { fetchUsDailyPrice, type UsDailyPriceResponse } from "@/lib/kis-us-daily-price";

export async function loadCachedUsDailyCandles(market: string, code: string, limit = 10): Promise<UsDailyCandle[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(usDailyPriceCandles).where(and(eq(usDailyPriceCandles.market, market), eq(usDailyPriceCandles.code, code))).orderBy(desc(usDailyPriceCandles.candleDate)).limit(limit);
  return rows.map((row) => ({ date: row.candleDate, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume, raw: { source: row.source, cached: true } }));
}

export async function saveUsDailyCandles(market: string, code: string, candles: UsDailyCandle[]) {
  const db = getDb();
  if (!db || candles.length === 0) return 0;
  await db.insert(usDailyPriceCandles).values(candles.map((candle) => ({ market, code, candleDate: candle.date, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, source: "KIS" }))).onConflictDoUpdate({ target: [usDailyPriceCandles.market, usDailyPriceCandles.code, usDailyPriceCandles.candleDate], set: { fetchedAt: new Date() } });
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
