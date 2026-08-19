import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

let activeWarm: Promise<Awaited<ReturnType<typeof executeWarm>>> | null = null;

export type WarmProgress = { processedCount: number; totalCount: number; successCount: number; failureCount: number; savedCandleCount: number; lastCode?: string; elapsedMs: number; etaMs: number | null };
async function executeWarm(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  const startedAt = new Date().toISOString();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  const nowMs = Date.now();
  const freshness = { D: 12 * 60 * 60 * 1000, W: 3 * 24 * 60 * 60 * 1000, M: 7 * 24 * 60 * 60 * 1000 } as const;
  const fetched = await getDb().execute(sql`SELECT timeframe, MAX(fetched_at) AS fetched_at FROM us_instrument_universe_candles GROUP BY timeframe`);
  const latestByTimeframe = new Map(fetched.rows.map((row: any) => [String(row.timeframe), row.fetched_at ? new Date(row.fetched_at).getTime() : 0]));
  const dueTimeframes = (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !latestByTimeframe.get(timeframe) || nowMs - Number(latestByTimeframe.get(timeframe)) >= freshness[timeframe]);
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  let cursor = 0;
  let successCount = 0;
  let candleCount = 0;
  let processedCount = 0;
  const progressStarted = Date.now();
  const failures: Array<{ market: string; code: string; error: string }> = [];
  async function worker() {
    while (true) {
      const item = instruments[cursor++];
      if (!item) return;
      try {
        let itemSuccess = true;
        for (const timeframe of dueTimeframes) {
          const daily = await fetchUsDailyPrice({ code: item.code, market: item.market, timeframe });
          if (!daily?.ok || daily.candles.length === 0) {
            itemSuccess = false;
            failures.push({ market: item.market, code: item.code, error: `${timeframe}: ${!daily ? "KIS access token unavailable" : !daily.ok ? `KIS API failed (${daily.status})` : "KIS returned no candles"}` });
            continue;
          }
          candleCount += await saveUsDailyCandles(item.market, item.code, daily.candles, timeframe);
        }
        if (itemSuccess) successCount += 1;
      } catch (error) { failures.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }); }
      processedCount += 1;
      const elapsedMs = Date.now() - progressStarted;
      options.onProgress?.({ processedCount, totalCount: instruments.length, successCount, failureCount: failures.length, savedCandleCount: candleCount, lastCode: item.code, elapsedMs, etaMs: processedCount ? Math.round(elapsedMs / processedCount * (instruments.length - processedCount)) : null });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, instruments.length)) }, worker));
  const completedAt = new Date().toISOString();
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, dueTimeframes, skippedTimeframes: (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !dueTimeframes.includes(timeframe)), startedAt, completedAt, durationMs, durationSeconds: Number((durationMs / 1000).toFixed(2)), instrumentCount: instruments.length, concurrency, successCount, failureCount: failures.length, savedCandleCount: candleCount, failures };
}

export function warmUsDailyPriceCache(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  if (!activeWarm) activeWarm = executeWarm(options).finally(() => { activeWarm = null; });
  return activeWarm;
}
