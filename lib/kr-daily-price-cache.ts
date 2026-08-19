import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krDailyPriceCandles, krInstrumentUniverseCandles, krMarketSnapshots } from "@/lib/schema";
import type { OHLCVCandle } from "@/lib/kis-chart";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";

export type CandleTimeframe = "D" | "W" | "M";

export async function loadCachedKrDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit = 100, timeframe: CandleTimeframe = "D") {
  const db = getDb();
  const result = new Map<string, OHLCVCandle[]>();
  if (!items.length) return result;
  const filters = items.map((item) => and(eq(krInstrumentUniverseCandles.market, item.market), eq(krInstrumentUniverseCandles.code, item.code), eq(krInstrumentUniverseCandles.timeframe, timeframe)));
  const rows = await db.select().from(krInstrumentUniverseCandles).where(or(...filters)).orderBy(desc(krInstrumentUniverseCandles.candleDate));
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    const candles = result.get(key) ?? [];
    if (candles.length < limit) candles.push({ date: row.candleDate, open: row.open ?? 0, high: row.high ?? 0, low: row.low ?? 0, close: row.close ?? 0, volume: row.volume ?? 0 });
    result.set(key, candles);
  }
  return result;
}

export async function saveKrDailyCandles(market: string, code: string, candles: OHLCVCandle[], timeframe: CandleTimeframe = "D") {
  if (!candles.length) return 0;
  await getDb().insert(krInstrumentUniverseCandles).values(candles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, source: "KIS" }))).onConflictDoUpdate({ target: [krInstrumentUniverseCandles.market, krInstrumentUniverseCandles.code, krInstrumentUniverseCandles.timeframe, krInstrumentUniverseCandles.candleDate], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, fetchedAt: new Date() } });
  return candles.length;
}

export async function refreshKrDailyCandles(code: string, timeframe: CandleTimeframe = "D") {
  const response = await fetchKrDailyPrice({ code, timeframe });
  if (response?.ok && response.candles.length) await saveKrDailyCandles("KRX", code, response.candles, timeframe);
  return response;
}

export async function loadKrMarketMetrics(items: Array<{ market: string; code: string }>) {
  const rows = items.length ? await getDb().select().from(krMarketSnapshots).where(or(...items.map((item) => and(eq(krMarketSnapshots.market, item.market), eq(krMarketSnapshots.code, item.code))))) : [];
  return new Map(rows.map((row) => [`${row.market}:${row.code}`, { marketCap: row.marketCap, turnoverRatio: row.turnoverRatio, price: row.price, volume: row.volume, tradingValue: row.tradingValue }]));
}

export async function refreshKrMarketSnapshot(code: string) {
  const response = await fetchKrPriceDetail(code);
  if (!response?.ok) return response;
  await getDb().insert(krMarketSnapshots).values({ market: "KRX", code, price: response.price, volume: response.volume, tradingValue: response.tradingValue, marketCap: response.marketCap, turnoverRatio: response.turnoverRatio, changeRate: response.changeRate, rawPayload: response.rawText, observedAt: new Date() }).onConflictDoUpdate({ target: [krMarketSnapshots.market, krMarketSnapshots.code], set: { price: response.price, volume: response.volume, tradingValue: response.tradingValue, marketCap: response.marketCap, turnoverRatio: response.turnoverRatio, changeRate: response.changeRate, rawPayload: response.rawText, observedAt: new Date() } });
  return response;
}
