import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usTradeIntensityTicks } from "@/lib/schema";
import type { KisUsTrade } from "@/lib/kis-us-trade-trend";

export type TradeIntensityScope = { market: string; code: string };

export async function saveUsTradeIntensityTicks(scope: TradeIntensityScope, trades: KisUsTrade[], fetchedAt = new Date()) {
  const db = getDb();
  if (!db || trades.length === 0) return { insertedCount: 0, skippedCount: trades.length };
  const values = trades.filter((trade) => trade.time).map((trade) => ({
    market: scope.market.toUpperCase(), code: scope.code.toUpperCase(), tradeTime: trade.time,
    price: trade.price, changeRate: trade.changeRate, volume: trade.volume, totalVolume: trade.totalVolume,
    marketType: trade.marketType || null, bid: trade.bid, ask: trade.ask, intensity: trade.intensity, fetchedAt,
  }));
  if (values.length === 0) return { insertedCount: 0, skippedCount: trades.length };
  const inserted = await db.insert(usTradeIntensityTicks).values(values).onConflictDoNothing().returning({ id: usTradeIntensityTicks.id });
  return { insertedCount: inserted.length, skippedCount: values.length - inserted.length };
}

export async function loadUsTradeIntensityTicks(scope: TradeIntensityScope, from: Date, to = new Date()) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(usTradeIntensityTicks).where(and(
    eq(usTradeIntensityTicks.market, scope.market.toUpperCase()),
    eq(usTradeIntensityTicks.code, scope.code.toUpperCase()),
    gte(usTradeIntensityTicks.fetchedAt, from),
    lte(usTradeIntensityTicks.fetchedAt, to),
  )).orderBy(desc(usTradeIntensityTicks.fetchedAt), desc(usTradeIntensityTicks.id));
}

export async function loadLatestUsTradeIntensity(scope: TradeIntensityScope, from: Date, to = new Date()) {
  const rows = await loadUsTradeIntensityTicks(scope, from, to);
  return rows.find((row) => row.intensity != null)?.intensity ?? null;
}
