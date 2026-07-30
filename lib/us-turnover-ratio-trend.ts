import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usTurnoverRatioSnapshots } from "@/lib/schema";
import type { UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import { classifyUsTurnoverSnapshotState, type UsTurnoverSnapshotState } from "@/lib/us-turnover-snapshot-state";

export type UsTurnoverRatioTrend = {
  isNew: boolean;
  snapshotState: UsTurnoverSnapshotState;
  oneMinuteTradingValueIncrease: number | null;
  oneMinuteTradingValueRvol: number | null;
  threeMinuteTradingValueIncrease: number | null;
  fiveMinuteTradingValueIncrease: number | null;
  oneMinuteIncrease: number | null;
  threeMinuteIncrease: number | null;
  fiveMinuteIncrease: number | null;
  oneMinuteSignal: boolean;
  threeMinuteSignal: boolean;
  fiveMinuteSignal: boolean;
};

export type UsTurnoverRatioItemWithTrend = UsTurnoverRatioItem & { trend: UsTurnoverRatioTrend };

const windows = [
  { minutes: 1, threshold: 1, key: "oneMinuteIncrease" as const, signal: "oneMinuteSignal" as const },
  { minutes: 3, threshold: 1.3, key: "threeMinuteIncrease" as const, signal: "threeMinuteSignal" as const },
  { minutes: 5, threshold: 5, key: "fiveMinuteIncrease" as const, signal: "fiveMinuteSignal" as const },
];

function startOfSeoulDay(value: Date) {
  const seoulTime = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(
    seoulTime.getUTCFullYear(),
    seoulTime.getUTCMonth(),
    seoulTime.getUTCDate(),
    9,
  ) - 9 * 60 * 60 * 1000);
}

export async function saveAndCalculateUsTurnoverRatioTrends(items: UsTurnoverRatioItem[], observedAt = new Date(), persist = true): Promise<UsTurnoverRatioItemWithTrend[]> {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const result: UsTurnoverRatioItemWithTrend[] = [];
  const dayStart = startOfSeoulDay(observedAt);

  for (const item of items) {
    const [sessionRows, previousSessionRows, ...previous] = await Promise.all([
      db.select({ id: usTurnoverRatioSnapshots.id, observedAt: usTurnoverRatioSnapshots.observedAt }).from(usTurnoverRatioSnapshots).where(and(eq(usTurnoverRatioSnapshots.market, item.market), eq(usTurnoverRatioSnapshots.code, item.code), gte(usTurnoverRatioSnapshots.observedAt, dayStart), lte(usTurnoverRatioSnapshots.observedAt, observedAt))).orderBy(desc(usTurnoverRatioSnapshots.observedAt)).limit(1),
      db.select({ id: usTurnoverRatioSnapshots.id }).from(usTurnoverRatioSnapshots).where(and(eq(usTurnoverRatioSnapshots.market, item.market), eq(usTurnoverRatioSnapshots.code, item.code), lte(usTurnoverRatioSnapshots.observedAt, dayStart))).limit(1),
      ...windows.map(async ({ minutes }) => {
      const cutoff = new Date(observedAt.getTime() - minutes * 60_000);
      const rows = await db.select().from(usTurnoverRatioSnapshots)
          .where(and(
          eq(usTurnoverRatioSnapshots.market, item.market),
          eq(usTurnoverRatioSnapshots.code, item.code),
          gte(usTurnoverRatioSnapshots.observedAt, dayStart),
          lte(usTurnoverRatioSnapshots.observedAt, cutoff),
        ))
        .orderBy(desc(usTurnoverRatioSnapshots.observedAt)).limit(1);
      return rows[0] ?? null;
      }),
    ]);
    const recentRows = await db.select({ tradingValue: usTurnoverRatioSnapshots.tradingValue }).from(usTurnoverRatioSnapshots).where(and(eq(usTurnoverRatioSnapshots.market, item.market), eq(usTurnoverRatioSnapshots.code, item.code), gte(usTurnoverRatioSnapshots.observedAt, dayStart), lte(usTurnoverRatioSnapshots.observedAt, observedAt))).orderBy(desc(usTurnoverRatioSnapshots.observedAt)).limit(8);
    const historicalIncreases = recentRows.slice(0, -1).map((row, index) => row.tradingValue - recentRows[index + 1].tradingValue).filter((value) => value > 0);
    const baseline = historicalIncreases.length > 0 ? historicalIncreases.reduce((sum, value) => sum + value, 0) / historicalIncreases.length : null;

    const increases = previous.map((row) => row ? item.turnoverRatio - row.turnoverRatio : null);
    const tradingValueIncreases = previous.map((row) => row ? item.tradingValue - row.tradingValue : null);
    const snapshotState = classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: sessionRows.length > 0, hadPreviousSessionSnapshot: previousSessionRows.length > 0, hasComparisonSnapshot: previous.some(Boolean), lastObservedAt: sessionRows[0]?.observedAt ?? null, now: observedAt });
    const trend: UsTurnoverRatioTrend = {
      isNew: sessionRows.length === 0,
      snapshotState,
      oneMinuteTradingValueIncrease: tradingValueIncreases[0],
      oneMinuteTradingValueRvol: tradingValueIncreases[0] !== null && baseline !== null && baseline > 0 ? tradingValueIncreases[0] / baseline : null,
      threeMinuteTradingValueIncrease: tradingValueIncreases[1],
      fiveMinuteTradingValueIncrease: tradingValueIncreases[2],
      oneMinuteIncrease: increases[0],
      threeMinuteIncrease: increases[1],
      fiveMinuteIncrease: increases[2],
      oneMinuteSignal: increases[0] !== null && increases[0] >= 1,
      threeMinuteSignal: increases[1] !== null && increases[1] >= 1.3,
      fiveMinuteSignal: increases[2] !== null && increases[2] >= 5,
    };

    if (persist) {
      await db.insert(usTurnoverRatioSnapshots).values({
        market: item.market,
        code: item.code,
        name: item.name,
        marketCap: item.marketCap,
        tradingValue: item.tradingValue,
        turnoverRatio: item.turnoverRatio,
        price: Number(item.price) || null,
        open: item.open ?? null,
        high: item.high ?? null,
        low: item.low ?? null,
        changeRate: Number.parseFloat(item.changeRate) || null,
        observedAt,
      }).onConflictDoNothing();
    }
    result.push({ ...item, trend });
  }
  return result;
}
