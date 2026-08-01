import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usShortInterestSnapshots, usNewsTickerExchangeCache } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-daily-breakout-watchlist";
import type { ShortInterestMetric } from "@/lib/short-interest-types";

export async function loadTodayShortInterest(ticker: string, source: ShortInterestMetric["source"], now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  const [row] = await getDb().select().from(usShortInterestSnapshots).where(and(eq(usShortInterestSnapshots.ticker, ticker.toUpperCase()), eq(usShortInterestSnapshots.source, source), gte(usShortInterestSnapshots.fetchedAt, start))).orderBy(desc(usShortInterestSnapshots.fetchedAt)).limit(1);
  return row ?? null;
}

export async function saveShortInterest(metric: ShortInterestMetric, fetchedAt = new Date()) {
  const db = getDb();
  const [marketRow] = await db.select({ market: usNewsTickerExchangeCache.market }).from(usNewsTickerExchangeCache).where(eq(usNewsTickerExchangeCache.ticker, metric.ticker.toUpperCase())).limit(1);
  const instrumentId = marketRow?.market ? await ensureUsInstrument({ market: marketRow.market, code: metric.ticker }) : null;
  const [row] = await db.insert(usShortInterestSnapshots).values({ ticker: metric.ticker, instrumentId, shortVolume: metric.shortVolume, totalVolume: metric.totalVolume, shortVolumeRatio: metric.shortVolumeRatio, shortInterest: metric.shortInterest, daysToCover: metric.daysToCover, previousShortInterest: metric.previousShortInterest ?? null, shortInterestChange: metric.shortInterestChange ?? null, shortInterestChangePercent: metric.shortInterestChangePercent ?? null, averageDailyVolume: metric.averageDailyVolume ?? null, thresholdListed: metric.thresholdListed ?? null, thresholdAsOf: metric.thresholdAsOf ?? null, asOf: metric.asOf, shortVolumeAsOf: metric.shortVolumeAsOf ?? null, shortInterestAsOf: metric.shortInterestAsOf ?? null, source: metric.source, status: metric.status, fetchedAt }).onConflictDoUpdate({ target: [usShortInterestSnapshots.ticker, usShortInterestSnapshots.source, usShortInterestSnapshots.asOf], set: { instrumentId, shortVolume: metric.shortVolume, totalVolume: metric.totalVolume, shortVolumeRatio: metric.shortVolumeRatio, shortInterest: metric.shortInterest, daysToCover: metric.daysToCover, previousShortInterest: metric.previousShortInterest ?? null, shortInterestChange: metric.shortInterestChange ?? null, shortInterestChangePercent: metric.shortInterestChangePercent ?? null, averageDailyVolume: metric.averageDailyVolume ?? null, thresholdListed: metric.thresholdListed ?? null, thresholdAsOf: metric.thresholdAsOf ?? null, shortVolumeAsOf: metric.shortVolumeAsOf ?? null, shortInterestAsOf: metric.shortInterestAsOf ?? null, status: metric.status, fetchedAt } }).returning();
  return row ?? null;
}
