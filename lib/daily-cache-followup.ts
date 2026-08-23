import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { calculateGoldenCross, persistGoldenCrossResults, type GoldenCrossResult } from "@/lib/daily-golden-cross";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { enqueueDailyFollowupRetry, markDailyFollowupRetrySuccess } from "@/lib/daily-followup-retry";

/** Refresh both daily Bollinger cache zones after candle storage. Discord
 * delivery remains owned by the Bollinger cron modules to avoid duplicates. */
export async function refreshDailyBollingerCaches(market: "KR" | "US") {
  const scan = market === "KR" ? scanStoredKrBollingerBands : scanStoredUsBollingerBands;
  const results: Record<string, unknown> = {};
  for (const zone of ["LOWER_OR_BELOW", "MIDDLE_TO_LOWER"] as const) {
    try {
      const scanned = await scan({ policy: { zone } } as any);
      results[zone] = await persistDailyBollingerResults(market, zone, scanned);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await enqueueDailyFollowupRetry(market, "BOLLINGER", message);
      results[zone] = { ok: false, error: message, retryQueued: true };
    }
  }
  if (Object.values(results).every((result: any) => result?.ok !== false)) await markDailyFollowupRetrySuccess(market, "BOLLINGER");
  return results;
}

/** Refresh the daily golden-cross cache immediately after daily candles. */
export async function refreshDailyGoldenCrossCache(market: "KR" | "US") {
  try {
    const settings = await loadFeatureModuleSettings(market === "KR" ? "kr-golden-cross" : "us-golden-cross");
    const policy = (settings.featureSettings?.goldenCrossPolicy ?? {}) as any;
    let results: GoldenCrossResult[];
    if (market === "KR") {
      const universe = await loadStoredKrInstrumentScopes();
      const candles = await loadCachedKrDailyCandlesBulk(universe.scopes, 30, "D");
      results = universe.scopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross(candles.get(`${scope.market}:${scope.code}`) ?? [], policy) }));
    } else {
      const context = await createUsDailyScanContext({ candleLimit: 30, timeframe: "D" });
      results = context.universe.scopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross(context.candles.get(`${scope.market}:${scope.code}`) ?? [], policy) }));
    }
    const cache = await persistGoldenCrossResults(market, results);
    await markDailyFollowupRetrySuccess(market, "GOLDEN_CROSS");
    return { ok: true, instrumentCount: results.length, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, cache };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await enqueueDailyFollowupRetry(market, "GOLDEN_CROSS", message);
    return { ok: false, retryQueued: true, error: message };
  }
}
