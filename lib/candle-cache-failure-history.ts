import { getDb } from "@/lib/db";
import { instrumentCandleCacheFailures } from "@/lib/schema";
import { enqueueCandleCacheRetry } from "@/lib/candle-cache-retry";

export async function recordCandleCacheFailure(input: { market: string; code: string; timeframe: "D" | "W" | "M"; error: string }) {
  const db = getDb();
  if (!db) return false;
  try {
    await db.insert(instrumentCandleCacheFailures).values({
      market: input.market,
      code: input.code,
      timeframe: input.timeframe,
      error: input.error.slice(0, 2_000),
    });
    await enqueueCandleCacheRetry(input);
    return true;
  } catch (error) {
    console.warn("[CandleCache] failure history unavailable:", error instanceof Error ? error.message : error);
    return false;
  }
}
