import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usDailyBreakoutWatchlist, usInstruments } from "@/lib/schema";
import { usTurnoverRatioSnapshots } from "@/lib/schema";

export async function listUsDailyBreakoutWatchlist() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(usDailyBreakoutWatchlist).where(eq(usDailyBreakoutWatchlist.enabled, true)).orderBy(asc(usDailyBreakoutWatchlist.market), asc(usDailyBreakoutWatchlist.code));
}

export async function ensureUsInstrument(input: { market: string; code: string; name?: string }) {
  const db = getDb();
  if (!db) return null;
  const market = input.market.trim().toUpperCase(); const code = input.code.trim().toUpperCase();
  if (!market || !code) return null;
  const [row] = await db.insert(usInstruments).values({ market, code, name: input.name?.trim() ?? "" }).onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { name: input.name?.trim() ?? "", updatedAt: new Date() } }).returning({ id: usInstruments.id });
  return row?.id ?? null;
}

export async function addUsDailyBreakoutWatchlist(input: { market: string; code: string; name?: string }) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  if (!["NAS", "NYS", "AMS"].includes(market) || !code) throw new Error("market must be NAS, NYS, or AMS and code is required");
  const [instrument] = await db.insert(usInstruments).values({ market, code, name: input.name?.trim() ?? "" }).onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { name: input.name?.trim() ?? "", updatedAt: new Date() } }).returning();
  const [row] = await db.insert(usDailyBreakoutWatchlist).values({ market, code, name: input.name?.trim() ?? "", instrumentId: instrument.id, enabled: true }).onConflictDoUpdate({ target: [usDailyBreakoutWatchlist.market, usDailyBreakoutWatchlist.code], set: { name: input.name?.trim() ?? "", instrumentId: instrument.id, enabled: true, updatedAt: new Date() } }).returning();
  return row;
}

export async function removeUsDailyBreakoutWatchlist(market: string, code: string) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.update(usDailyBreakoutWatchlist).set({ enabled: false, updatedAt: new Date() }).where(and(eq(usDailyBreakoutWatchlist.market, market.trim().toUpperCase()), eq(usDailyBreakoutWatchlist.code, code.trim().toUpperCase())));
}

/** Copies recent scanner symbols into the dedicated daily-breakout table. Detection never reads snapshots directly. */
export async function syncUsDailyBreakoutWatchlistFromTurnoverSnapshots() {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const snapshots = await db.select({ market: usTurnoverRatioSnapshots.market, code: usTurnoverRatioSnapshots.code, name: usTurnoverRatioSnapshots.name }).from(usTurnoverRatioSnapshots).where(gte(usTurnoverRatioSnapshots.observedAt, since));
  const keys = new Set<string>();
  for (const item of snapshots) {
    const market = item.market.trim().toUpperCase(); const code = item.code.trim().toUpperCase();
    if (!["NAS", "NYS", "AMS"].includes(market) || !code || keys.has(`${market}:${code}`)) continue;
    keys.add(`${market}:${code}`);
    const [instrument] = await db.insert(usInstruments).values({ market, code, name: item.name }).onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { name: item.name, updatedAt: new Date() } }).returning();
    await db.insert(usDailyBreakoutWatchlist).values({ market, code, name: item.name, instrumentId: instrument.id, source: "TURNOVER_SNAPSHOT", enabled: true }).onConflictDoUpdate({ target: [usDailyBreakoutWatchlist.market, usDailyBreakoutWatchlist.code], set: { name: item.name, instrumentId: instrument.id, source: "TURNOVER_SNAPSHOT", enabled: true, updatedAt: new Date() } });
  }
  return { source: "TURNOVER_SNAPSHOT", importedCount: keys.size };
}
