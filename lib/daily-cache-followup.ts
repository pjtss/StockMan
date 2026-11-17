import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { calculateGoldenCross, persistGoldenCrossResults, type GoldenCrossResult } from "@/lib/daily-golden-cross";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { enqueueDailyFollowupRetry, markDailyFollowupRetrySuccess } from "@/lib/daily-followup-retry";
import { isWithinSchedule } from "@/lib/schedule-time";
import { KR_MARKET_CAP_MAX_AGE_HOURS, loadKrMarketCapSnapshots, meetsKrMarketCapFloorKrw } from "@/lib/kr-market-cap";

/** Refresh both daily Bollinger cache zones after candle storage. Discord
 * delivery remains owned by the Bollinger cron modules to avoid duplicates. */
export async function refreshDailyBollingerCaches(market: "KR" | "US") {
  const settings = await loadFeatureModuleSettings(market === "KR" ? "kr-bollinger-band" : "us-bollinger-band");
  if (!settings.enabled) return { skipped: true, reason: "disabled" };
  if (!isWithinSchedule(settings)) return { skipped: true, reason: "outside_schedule" };
  const scan = market === "KR" ? scanStoredKrBollingerBands : scanStoredUsBollingerBands;
  const results: Record<string, unknown> = {};
  await Promise.all(([
    "LOWER_OR_BELOW",
    "MIDDLE_TO_LOWER",
  ] as const).map(async (zone) => {
    try {
      const scanned = await scan({ policy: { zone } } as any);
      if ((market === "US" && scanned.ok !== true) || scanned.universeAvailable !== true || !Number.isSafeInteger(scanned.instrumentCount) || scanned.instrumentCount <= 0) {
        throw new Error(`${market}_BOLLINGER_SCAN_UNIVERSE_UNAVAILABLE`);
      }
      const persisted = await persistDailyBollingerResults(market, zone, scanned);
      results[zone] = { ok: true, ...persisted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryQueued = await enqueueDailyFollowupRetry(market, "BOLLINGER", message);
      results[zone] = { ok: false, error: message, retryQueued };
    }
  }));
  let ok = Object.values(results).every((result: any) => result?.ok === true);
  let retryMarkerOk: boolean | null = null;
  if (ok) {
    retryMarkerOk = await markDailyFollowupRetrySuccess(market, "BOLLINGER");
    if (!retryMarkerOk) ok = false;
  }
  const staleScanSkippedCount = Object.values(results).filter((result: any) => result?.staleScanSkipped === true).length;
  return { ok, retryMarkerOk, staleScanSkippedCount, zones: results };
}

/** Refresh the daily golden-cross cache immediately after daily candles. */
export async function refreshDailyGoldenCrossCache(market: "KR" | "US") {
  try {
    const settings = await loadFeatureModuleSettings(market === "KR" ? "kr-golden-cross" : "us-golden-cross");
    if (!settings.enabled) return { skipped: true, reason: "disabled" };
    if (!isWithinSchedule(settings)) return { skipped: true, reason: "outside_schedule" };
    const policy = (settings.featureSettings?.goldenCrossPolicy ?? {}) as any;
    let results: GoldenCrossResult[];
    if (market === "KR") {
      const universe = await loadStoredKrInstrumentScopes();
      if (!Array.isArray(universe.scopes) || universe.scopes.length === 0) throw new Error("KR_GOLDEN_CROSS_UNIVERSE_UNAVAILABLE");
      const marketCaps = await loadKrMarketCapSnapshots(universe.scopes);
      const eligibleScopes = universe.scopes.filter((item) => meetsKrMarketCapFloorKrw(marketCaps.get(`${item.market}:${item.code}`) ?? null));
      const candles = await loadCachedKrDailyCandlesBulk(eligibleScopes, 30, "D");
      results = eligibleScopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross((candles.get(`${scope.market}:${scope.code}`) ?? []).map((candle) => ({ ...candle, updatedAt: candle.fetchedAt ?? null })), policy) }));
      const cache = await persistGoldenCrossResults("KR", results, { allowEmpty: true });
      if (!await markDailyFollowupRetrySuccess("KR", "GOLDEN_CROSS")) throw new Error("GOLDEN_CROSS_FOLLOWUP_RETRY_SUCCESS_MARKER_FAILED");
      return { ok: true, instrumentCount: results.length, marketCapExcludedCount: universe.scopes.length - eligibleScopes.length, marketCapFilter: { minimumKrwExclusive: 30_000_000_000, maxSnapshotAgeHours: KR_MARKET_CAP_MAX_AGE_HOURS, unknownOrStale: "excluded" }, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, cache };
    } else {
      const context = await createUsDailyScanContext({ candleLimit: 30, timeframe: "D" });
      if (context.universe.universe.ok !== true || context.universe.scopes.length === 0) throw new Error("US_GOLDEN_CROSS_UNIVERSE_UNAVAILABLE");
      results = context.universe.scopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross(context.candles.get(`${scope.market}:${scope.code}`) ?? [], policy) }));
    }
    if (results.length === 0) throw new Error(`${market}_GOLDEN_CROSS_EMPTY_RESULTS`);
    const cache = await persistGoldenCrossResults(market, results);
    if (!await markDailyFollowupRetrySuccess(market, "GOLDEN_CROSS")) throw new Error("GOLDEN_CROSS_FOLLOWUP_RETRY_SUCCESS_MARKER_FAILED");
    return { ok: true, instrumentCount: results.length, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, cache };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryQueued = await enqueueDailyFollowupRetry(market, "GOLDEN_CROSS", message);
    return { ok: false, retryQueued, error: message };
  }
}
