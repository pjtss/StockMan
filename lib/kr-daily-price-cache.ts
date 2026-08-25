import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstrumentUniverseCandles } from "@/lib/schema";
import type { OHLCVCandle } from "@/lib/kis-chart";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";

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
  await getDb().insert(krInstrumentUniverseCandles).values(candles.map((candle) => ({ market, code, timeframe, candleDate: candle.date, candleTime: null, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, source: "KIS" }))).onConflictDoUpdate({ target: [krInstrumentUniverseCandles.market, krInstrumentUniverseCandles.code, krInstrumentUniverseCandles.timeframe, krInstrumentUniverseCandles.candleDate], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, fetchedAt: new Date() } });
  return candles.length;
}

export async function refreshKrDailyCandles(code: string, timeframe: CandleTimeframe = "D", market = "KOSPI") {
  const response = await fetchKrDailyPrice({ code, timeframe });
  if (response?.ok && response.candles.length) await saveKrDailyCandles(market, code, response.candles, timeframe);
  return response;
}
