import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { recordCandleCacheFailure } from "@/lib/candle-cache-failure-history";
import { loadDueCandleCacheRetries, markCandleCacheRetrySuccess } from "@/lib/candle-cache-retry";
import { refreshDailyBollingerCaches } from "@/lib/daily-cache-followup";

let activeWarm: Promise<Awaited<ReturnType<typeof executeWarm>>> | null = null;

export type WarmProgress = { processedCount: number; totalCount: number; successCount: number; failureCount: number; savedCandleCount: number; lastCode?: string; elapsedMs: number; etaMs: number | null };
async function executeWarm(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  const startedAt = new Date().toISOString();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  const nowMs = Date.now();
  // The current-day candle is partial during market hours, so refresh it
  // frequently while keeping weekly/monthly traffic bounded.
  // 일봉·주봉은 매일 1회, 월봉은 주 1회 갱신한다. 실패한 캔들은 retry queue가 우선한다.
  const freshness = { D: 24 * 60 * 60 * 1000, W: 24 * 60 * 60 * 1000, M: 7 * 24 * 60 * 60 * 1000 } as const;
  const fetched = await getDb().execute(sql`SELECT timeframe, MAX(fetched_at) AS fetched_at FROM us_instrument_universe_candles GROUP BY timeframe`);
  const latestByTimeframe = new Map(fetched.rows.map((row: any) => [String(row.timeframe), row.fetched_at ? new Date(row.fetched_at).getTime() : 0]));
  const retryRows = await loadDueCandleCacheRetries();
  const retryKeys = new Set(retryRows.map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}:${row.timeframe}`));
  const dueTimeframes = (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !latestByTimeframe.get(timeframe) || nowMs - Number(latestByTimeframe.get(timeframe)) >= freshness[timeframe] || retryRows.some((row) => row.timeframe === timeframe));
  // A global MAX(fetched_at) cannot prove that every ticker has enough
  // history. Backfill only symbols whose daily cache is below the scanner's
  // minimum history, even when the normal daily timeframe is not due yet.
  const underfilledDaily = new Set<string>();
  const underfilled = await getDb().execute(sql`SELECT u.market, u.code
    FROM us_instrument_universe u
    LEFT JOIN us_instrument_universe_candles c
      ON c.market = u.market AND c.code = u.code AND c.timeframe = 'D'
    WHERE u.enabled = true AND u.instrument_type = 'COMMON_STOCK'
    GROUP BY u.market, u.code
    HAVING COUNT(c.candle_date) < 35`);
  for (const row of underfilled.rows as Array<{ market: string; code: string }>) underfilledDaily.add(`${String(row.market).toUpperCase()}:${String(row.code).toUpperCase()}`);
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
        for (const timeframe of (Object.keys(freshness) as Array<keyof typeof freshness>)) {
          const key = `${item.market.toUpperCase()}:${item.code.toUpperCase()}`;
          const shouldFetch = retryKeys.has(`${key}:${timeframe}`) || dueTimeframes.includes(timeframe) || (timeframe === "D" && underfilledDaily.has(key));
          if (!shouldFetch) continue;
          const daily = await fetchUsDailyPrice({ code: item.code, market: item.market, timeframe });
          if (!daily?.ok || daily.candles.length === 0) {
            itemSuccess = false;
            const error = `${timeframe}: ${!daily ? "KIS access token unavailable" : !daily.ok ? `KIS API failed (${daily.status})` : "KIS returned no candles"}`;
            failures.push({ market: item.market, code: item.code, error });
            await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error });
            continue;
          }
          candleCount += await saveUsDailyCandles(item.market, item.code, daily.candles, timeframe);
          await markCandleCacheRetrySuccess({ market: item.market, code: item.code, timeframe });
        }
        if (itemSuccess) successCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ market: item.market, code: item.code, error: message });
        for (const timeframe of dueTimeframes) await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error: message });
      }
      processedCount += 1;
      const elapsedMs = Date.now() - progressStarted;
      options.onProgress?.({ processedCount, totalCount: instruments.length, successCount, failureCount: failures.length, savedCandleCount: candleCount, lastCode: item.code, elapsedMs, etaMs: processedCount ? Math.round(elapsedMs / processedCount * (instruments.length - processedCount)) : null });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, instruments.length)) }, worker));
  const completedAt = new Date().toISOString();
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  const bollingerCache = failures.length === 0 ? await refreshDailyBollingerCaches("US") : { skipped: true, reason: "daily_candle_failures", failureCount: failures.length };
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, dueTimeframes, backfillDailyCount: underfilledDaily.size, skippedTimeframes: (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !dueTimeframes.includes(timeframe)), startedAt, completedAt, durationMs, durationSeconds: Number((durationMs / 1000).toFixed(2)), instrumentCount: instruments.length, concurrency, successCount, failureCount: failures.length, savedCandleCount: candleCount, failures, bollingerCache };
}

export function warmUsDailyPriceCache(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  if (!activeWarm) activeWarm = executeWarm(options).finally(() => { activeWarm = null; });
  return activeWarm;
}
