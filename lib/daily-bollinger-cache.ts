import { writeKisCacheIfSourceIsNewer } from "@/lib/kis-cache";
import { DailyBollingerRetrySupersededError, enqueueDailyBollingerRetry, markDailyBollingerRetrySuccess } from "@/lib/daily-bollinger-retry";
import { isUsDailyScanComplete } from "@/lib/us-daily-scan-failure-reasons";

export type DailyBollingerCacheScope = "KR" | "US";
export type DailyBollingerCacheZone = "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER";

export async function persistDailyBollingerResults(
  scope: DailyBollingerCacheScope,
  zone: DailyBollingerCacheZone,
  scan: { ok?: boolean; status?: string; universeAvailable?: boolean; checkedAt?: string; sourceCheckedAt?: string; instrumentCount?: number; successCount?: number; failureCount?: number; partialFailureCount?: number; qualified?: unknown[] },
) {
  if (scope === "US" ? !isUsDailyScanComplete(scan) : scan.ok === false || scan.universeAvailable === false || !Number.isSafeInteger(scan.instrumentCount) || (scan.instrumentCount ?? 0) <= 0 || (scan.failureCount ?? 0) > 0 || (scan.successCount != null && scan.successCount !== scan.instrumentCount)) {
    const message = `${scope}_BOLLINGER_CACHE_REFUSED_INCOMPLETE_SCAN`;
    if (!await enqueueDailyBollingerRetry({ scope, zone, sourceCheckedAt: scan.sourceCheckedAt, error: message })) throw new Error(`${message}_RETRY_ENQUEUE_FAILED`);
    throw new Error(message);
  }
  const key = `daily-bollinger:${scope}:D:${zone}`;
  const qualified = Array.isArray(scan.qualified) ? scan.qualified : [];
  const sourceCheckedAt = scan.sourceCheckedAt;
  if (typeof sourceCheckedAt !== "string" || !Number.isFinite(Date.parse(sourceCheckedAt))) {
    const message = `${scope}_BOLLINGER_SOURCE_GENERATION_MISSING_OR_INVALID`;
    if (!await enqueueDailyBollingerRetry({ scope, zone, sourceCheckedAt, error: message })) throw new Error(`${message}_RETRY_ENQUEUE_FAILED`);
    throw new Error(message);
  }
  try {
    const wrote = await writeKisCacheIfSourceIsNewer(key, {
      scope, timeframe: "D", zone,
      sourceCheckedAt, scannedCount: scan.instrumentCount ?? 0,
      successCount: scan.successCount ?? 0, failureCount: scan.failureCount ?? 0,
      qualifiedCount: qualified.length, qualified,
    }, sourceCheckedAt);
    const retryMarked = await markDailyBollingerRetrySuccess({ scope, zone, sourceCheckedAt });
    if (retryMarked === "SUPERSEDED") throw new DailyBollingerRetrySupersededError();
    if (retryMarked === "ERROR") throw new Error(`${scope}_BOLLINGER_RETRY_SUCCESS_MARKER_FAILED`);
    return { cached: true, staleScanSkipped: !wrote, cacheKey: key, qualifiedCount: qualified.length };
  } catch (error) {
    if (error instanceof DailyBollingerRetrySupersededError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const retryQueued = await enqueueDailyBollingerRetry({ scope, zone, sourceCheckedAt, error: message });
    if (!retryQueued) throw new Error(`${message}; retry enqueue failed`);
    throw error;
  }
}
