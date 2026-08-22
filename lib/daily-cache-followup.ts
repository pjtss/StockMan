import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";

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
      results[zone] = { ok: false, error: message, retryQueued: true };
    }
  }
  return results;
}
