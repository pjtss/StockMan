import { listUsDailyBreakoutWatchlist } from "@/lib/us-daily-breakout-watchlist";
import { findUsFiveDayHighBreakout, type UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";

export async function runUsDailyBreakoutScan() {
  const watchlist = await listUsDailyBreakoutWatchlist();
  const results: UsFiveDayHighBreakoutResult[] = [];
  for (const item of watchlist) results.push(await findUsFiveDayHighBreakout({ code: item.code, market: item.market }));
  return { watchlistCount: watchlist.length, qualified: results.filter((result) => result.qualifies), successCount: results.filter((result) => result.ok).length, failureCount: results.filter((result) => !result.ok).length, results };
}

