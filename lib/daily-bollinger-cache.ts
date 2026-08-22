import { writeKisCache } from "@/lib/kis-cache";
import { enqueueDailyBollingerRetry, markDailyBollingerRetrySuccess } from "@/lib/daily-bollinger-retry";

export type DailyBollingerCacheScope = "KR" | "US";
export type DailyBollingerCacheZone = "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER";

export async function persistDailyBollingerResults(
  scope: DailyBollingerCacheScope,
  zone: DailyBollingerCacheZone,
  scan: { checkedAt?: string; instrumentCount?: number; successCount?: number; failureCount?: number; qualified?: unknown[] },
) {
  const key = `daily-bollinger:${scope}:D:${zone}`;
  const qualified = Array.isArray(scan.qualified) ? scan.qualified : [];
  try {
    await writeKisCache(key, {
      scope, timeframe: "D", zone, updatedAt: new Date().toISOString(),
      sourceCheckedAt: scan.checkedAt ?? null, scannedCount: scan.instrumentCount ?? 0,
      successCount: scan.successCount ?? 0, failureCount: scan.failureCount ?? 0,
      qualifiedCount: qualified.length, qualified,
    });
    await markDailyBollingerRetrySuccess({ scope, zone });
    return { cached: true, cacheKey: key, qualifiedCount: qualified.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await enqueueDailyBollingerRetry({ scope, zone, error: message });
    throw error;
  }
}
