import { listUsDailyBreakoutWatchlist } from "@/lib/us-daily-breakout-watchlist";
import { findUsFiveDayHighBreakout, type UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { getUsFreeFloat } from "@/lib/us-free-float";

export async function runUsDailyBreakoutScan() {
  const watchlist = await listUsDailyBreakoutWatchlist();
  const results: UsFiveDayHighBreakoutResult[] = [];
  for (const item of watchlist) {
    const result = await findUsFiveDayHighBreakout({ code: item.code, market: item.market });
    const float = await getUsFreeFloat(item.code).catch(() => null);
    results.push({ ...result, freeFloatShares: float?.ok ? float.floatShares : null, freeFloatPercent: float?.ok ? float.freeFloatPercent : null });
  }
  return { watchlistCount: watchlist.length, qualified: results.filter((result) => result.qualifies), successCount: results.filter((result) => result.ok).length, failureCount: results.filter((result) => !result.ok).length, results };
}
