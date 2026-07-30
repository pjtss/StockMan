import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usFreeFloatSnapshots } from "@/lib/schema";
import type { FreeFloatResult } from "@/lib/fmp-free-float";

export async function loadFreshFreeFloat(ticker: string, now = new Date()) {
  const db = getDb();
  const since = new Date(now); since.setUTCHours(0, 0, 0, 0);
  const rows = await db.select().from(usFreeFloatSnapshots).where(and(eq(usFreeFloatSnapshots.ticker, ticker.toUpperCase()), gte(usFreeFloatSnapshots.fetchedAt, since))).limit(1);
  return rows[0] ?? null;
}

export async function saveFreeFloat(result: FreeFloatResult, fetchedAt = new Date()) {
  if (!result.ok || result.floatShares == null) return null;
  const db = getDb();
  const [row] = await db.insert(usFreeFloatSnapshots).values({ ticker: result.ticker, floatShares: result.floatShares, outstandingShares: result.outstandingShares, freeFloatPercent: result.freeFloatPercent, asOf: result.asOf, source: result.source, fetchedAt }).onConflictDoUpdate({ target: usFreeFloatSnapshots.ticker, set: { floatShares: result.floatShares, outstandingShares: result.outstandingShares, freeFloatPercent: result.freeFloatPercent, asOf: result.asOf, source: result.source, fetchedAt } }).returning();
  return row ?? null;
}
