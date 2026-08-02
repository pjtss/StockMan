import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";
import { findUsFiveDayHighBreakout, type UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { getUsFreeFloat } from "@/lib/us-free-float";

export async function runUsDailyBreakoutScan() {
  // Automatic detection uses the canonical instrument registry, not the
  // legacy/manual breakout watchlist. Only enabled US exchanges are included.
  const watchlist = await listStoredUsInstruments();
  const results: UsFiveDayHighBreakoutResult[] = [];
  for (const item of watchlist) {
    const result = await findUsFiveDayHighBreakout({ code: item.code, market: item.market });
    const float = await getUsFreeFloat(item.code).catch(() => null);
    results.push({ ...result, freeFloatShares: float?.ok ? float.floatShares : null, freeFloatPercent: float?.ok ? float.freeFloatPercent : null });
  }
  return { watchlistCount: watchlist.length, instrumentCount: watchlist.length, qualified: results.filter((result) => result.qualifies), successCount: results.filter((result) => result.ok).length, failureCount: results.filter((result) => !result.ok).length, results };
}
