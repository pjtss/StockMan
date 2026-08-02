import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usShortMetrics } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";

type SaveShortMetricInput = {
  ticker: string;
  metricType: "BORROW_AVAILABILITY" | "SHORT_INTEREST" | "SHORT_VOLUME" | "THRESHOLD_LIST";
  source: string;
  accountScope?: string;
  status: string;
  asOf?: string | null;
  shortVolume?: number | null;
  totalVolume?: number | null;
  shortVolumeRatio?: number | null;
  shortInterest?: number | null;
  daysToCover?: number | null;
  availableQty?: number | null;
  locateFeeRatePercent?: number | null;
  pressureScore?: number | null;
  pressureLevel?: string | null;
  rawPayload?: unknown;
};

export async function saveShortMetric(input: SaveShortMetricInput) {
  const db = getDb();
  if (!db) return null;
  const ticker = input.ticker.trim().toUpperCase();
  let instrumentId: number | null = null;
  try { instrumentId = await ensureUsInstrument({ market: "NAS", code: ticker }); } catch { /* preserve source result if canonical lookup is unavailable */ }
  const [row] = await db.insert(usShortMetrics).values({
    ticker,
    instrumentId: instrumentId ?? undefined,
    metricType: input.metricType,
    source: input.source,
    accountScope: input.accountScope ?? "MARKET",
    status: input.status,
    asOf: input.asOf ?? null,
    shortVolume: input.shortVolume ?? null,
    totalVolume: input.totalVolume ?? null,
    shortVolumeRatio: input.shortVolumeRatio ?? null,
    shortInterest: input.shortInterest ?? null,
    daysToCover: input.daysToCover ?? null,
    availableQty: input.availableQty ?? null,
    locateFeeRatePercent: input.locateFeeRatePercent ?? null,
    pressureScore: input.pressureScore ?? null,
    pressureLevel: input.pressureLevel ?? null,
    rawPayload: input.rawPayload ?? {},
  }).returning();
  return row ?? null;
}

export async function loadLatestShortMetrics(ticker: string) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(usShortMetrics)
    .where(eq(usShortMetrics.ticker, ticker.trim().toUpperCase()))
    .orderBy(desc(usShortMetrics.observedAt), desc(usShortMetrics.id));
}
