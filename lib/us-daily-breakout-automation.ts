import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";
import { findUsFiveDayHighBreakout, type UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { getUsFreeFloat } from "@/lib/us-free-float";

export async function runUsDailyBreakoutScan(options: { limit?: number } = {}) {
  // Automatic detection uses the canonical instrument registry, not the
  // legacy/manual breakout watchlist. Only enabled US exchanges are included.
  const watchlist = await listStoredUsInstruments();
  const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0 ? Math.floor(options.limit as number) : null;
  const scanList = limit ? watchlist.slice(0, limit) : watchlist;
  const results: UsFiveDayHighBreakoutResult[] = [];
  for (const item of scanList) {
    const result = await findUsFiveDayHighBreakout({ code: item.code, market: item.market });
    // Free-float is only needed for an actual breakout notification. Avoid an
    // FMP request for every non-breakout instrument in the full-table scan.
    if (!result.qualifies) {
      results.push({ ...result, freeFloatShares: null, freeFloatPercent: null });
      continue;
    }
    const float = await getUsFreeFloat(item.code).catch(() => null);
    results.push({ ...result, freeFloatShares: float?.ok ? float.floatShares : null, freeFloatPercent: float?.ok ? float.freeFloatPercent : null });
  }
  return { watchlistCount: watchlist.length, instrumentCount: scanList.length, limited: Boolean(limit && limit < watchlist.length), qualified: results.filter((result) => result.qualifies), successCount: results.filter((result) => result.ok).length, failureCount: results.filter((result) => !result.ok).length, results };
}
