import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usShortInterestSnapshots } from "@/lib/schema";
import type { ShortInterestMetric } from "@/lib/short-interest-types";

export async function loadTodayShortInterest(ticker: string, source: ShortInterestMetric["source"], now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const [row] = await getDb().select().from(usShortInterestSnapshots).where(and(eq(usShortInterestSnapshots.ticker, ticker.toUpperCase()), eq(usShortInterestSnapshots.source, source), gte(usShortInterestSnapshots.fetchedAt, start))).orderBy(desc(usShortInterestSnapshots.fetchedAt)).limit(1);
  return row ?? null;
}

export async function saveShortInterest(metric: ShortInterestMetric, fetchedAt = new Date()) {
  const [row] = await getDb().insert(usShortInterestSnapshots).values({ ticker: metric.ticker, shortVolume: metric.shortVolume, totalVolume: metric.totalVolume, shortVolumeRatio: metric.shortVolumeRatio, shortInterest: metric.shortInterest, daysToCover: metric.daysToCover, asOf: metric.asOf, source: metric.source, status: metric.status, fetchedAt }).onConflictDoUpdate({ target: [usShortInterestSnapshots.ticker, usShortInterestSnapshots.source, usShortInterestSnapshots.asOf], set: { shortVolume: metric.shortVolume, totalVolume: metric.totalVolume, shortVolumeRatio: metric.shortVolumeRatio, shortInterest: metric.shortInterest, daysToCover: metric.daysToCover, status: metric.status, fetchedAt } }).returning();
  return row ?? null;
}
