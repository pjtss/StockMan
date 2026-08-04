import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";
import { findUsFiveDayHighBreakout, type UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { getUsFreeFloat } from "@/lib/us-free-float";
import { loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";

export async function runUsDailyBreakoutScan(options: { limit?: number; concurrency?: number } = {}) {
  const startedAt = Date.now();
  // Automatic detection uses the canonical instrument registry, not the
  // legacy/manual breakout watchlist. Only enabled US exchanges are included.
  const watchlist = await listStoredUsInstruments();
  const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0 ? Math.floor(options.limit as number) : null;
  const scanList = limit ? watchlist.slice(0, limit) : watchlist;
  const cachedCandles = await loadCachedUsDailyCandlesBulk(scanList, 10).catch(() => new Map<string, any[]>());
  // Run several instruments concurrently while the shared KIS limiter still
  // serializes the actual requests. This overlaps network latency without
  // increasing the API request rate.
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const results: Array<UsFiveDayHighBreakoutResult | undefined> = Array.from({ length: scanList.length });
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      const item = scanList[index];
      if (!item) return;
      const result = await findUsFiveDayHighBreakout({ code: item.code, market: item.market, cachedCandles: cachedCandles.get(`${item.market}:${item.code}`) });
      // Free-float is only needed for an actual breakout notification. Avoid an
      // FMP request for every non-breakout instrument in the full-table scan.
      if (!result.qualifies) {
        results[index] = { ...result, freeFloatShares: null, freeFloatPercent: null };
        continue;
      }
      const float = await getUsFreeFloat(item.code).catch(() => null);
      results[index] = { ...result, freeFloatShares: float?.ok ? float.floatShares : null, freeFloatPercent: float?.ok ? float.freeFloatPercent : null };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, scanList.length)) }, worker));
  const completedResults = results.filter((result): result is UsFiveDayHighBreakoutResult => Boolean(result));
  const failures = completedResults.filter((result) => !result.ok);
  const failureReasons = failures.reduce<Record<string, number>>((counts, result) => { const reason = result.error ?? "unknown"; counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {});
  const marketCounts = completedResults.reduce<Record<string, number>>((counts, result) => { counts[result.market] = (counts[result.market] ?? 0) + 1; return counts; }, {});
  return { watchlistCount: watchlist.length, instrumentCount: scanList.length, concurrency, limited: Boolean(limit && limit < watchlist.length), durationMs: Date.now() - startedAt, throughputPerSecond: completedResults.length ? Number((completedResults.length / ((Date.now() - startedAt) / 1000)).toFixed(2)) : 0, qualified: completedResults.filter((result) => result.qualifies), successCount: completedResults.filter((result) => result.ok).length, failureCount: failures.length, failureReasons, resolvedMarketCounts: marketCounts, results: completedResults };
}
