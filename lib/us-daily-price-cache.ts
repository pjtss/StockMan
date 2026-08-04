import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usDailyPriceCandles } from "@/lib/schema";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";

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
