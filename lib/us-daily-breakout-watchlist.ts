import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usDailyBreakoutWatchlist } from "@/lib/schema";

export async function listUsDailyBreakoutWatchlist() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(usDailyBreakoutWatchlist).where(eq(usDailyBreakoutWatchlist.enabled, true)).orderBy(asc(usDailyBreakoutWatchlist.market), asc(usDailyBreakoutWatchlist.code));
}

export async function addUsDailyBreakoutWatchlist(input: { market: string; code: string; name?: string }) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  if (!["NAS", "NYS", "AMS"].includes(market) || !code) throw new Error("market must be NAS, NYS, or AMS and code is required");
  const [row] = await db.insert(usDailyBreakoutWatchlist).values({ market, code, name: input.name?.trim() ?? "", enabled: true }).onConflictDoUpdate({ target: [usDailyBreakoutWatchlist.market, usDailyBreakoutWatchlist.code], set: { name: input.name?.trim() ?? "", enabled: true, updatedAt: new Date() } }).returning();
  return row;
}

export async function removeUsDailyBreakoutWatchlist(market: string, code: string) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.update(usDailyBreakoutWatchlist).set({ enabled: false, updatedAt: new Date() }).where(and(eq(usDailyBreakoutWatchlist.market, market.trim().toUpperCase()), eq(usDailyBreakoutWatchlist.code, code.trim().toUpperCase())));
}

