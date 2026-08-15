import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usFreeFloatSnapshots, usNewsTickerExchangeCache } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";
import type { FreeFloatResult } from "@/lib/fmp-free-float";

export async function loadFreshFreeFloat(ticker: string, now = new Date()) {
  const db = getDb();
  const since = new Date(now); since.setUTCHours(0, 0, 0, 0);
  const rows = await db.select().from(usFreeFloatSnapshots).where(and(eq(usFreeFloatSnapshots.ticker, ticker.toUpperCase()), gte(usFreeFloatSnapshots.fetchedAt, since))).limit(1);
  return rows[0] ?? null;
}

/** Returns the most recently stored snapshot so the caller can apply an
 * explicit freshness policy based on the provider's as-of date. */
export async function loadLatestFreeFloat(ticker: string) {
  const db = getDb();
  const rows = await db.select().from(usFreeFloatSnapshots)
    .where(eq(usFreeFloatSnapshots.ticker, ticker.toUpperCase()))
    .orderBy(desc(usFreeFloatSnapshots.fetchedAt)).limit(1);
  return rows[0] ?? null;
}

/** Stale snapshots are deliberately removed before a refresh is attempted. */
export async function deleteFreeFloat(ticker: string) {
  const db = getDb();
  await db.delete(usFreeFloatSnapshots).where(eq(usFreeFloatSnapshots.ticker, ticker.toUpperCase()));
}

export async function saveFreeFloat(result: FreeFloatResult, fetchedAt = new Date()) {
  if (!result.ok || result.floatShares == null) return null;
  const db = getDb();
  const [marketRow] = await db.select({ market: usNewsTickerExchangeCache.market }).from(usNewsTickerExchangeCache).where(eq(usNewsTickerExchangeCache.ticker, result.ticker.toUpperCase())).limit(1);
  const instrumentId = marketRow?.market ? await ensureUsInstrument({ market: marketRow.market, code: result.ticker }) : null;
  const [row] = await db.insert(usFreeFloatSnapshots).values({ ticker: result.ticker, instrumentId, floatShares: result.floatShares, outstandingShares: result.outstandingShares, freeFloatPercent: result.freeFloatPercent, asOf: result.asOf, source: result.source, fetchedAt }).onConflictDoUpdate({ target: usFreeFloatSnapshots.ticker, set: { instrumentId, floatShares: result.floatShares, outstandingShares: result.outstandingShares, freeFloatPercent: result.freeFloatPercent, asOf: result.asOf, source: result.source, fetchedAt } }).returning();
  return row ?? null;
}
