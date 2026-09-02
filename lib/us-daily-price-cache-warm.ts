import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { recordCandleCacheFailure } from "@/lib/candle-cache-failure-history";
import { loadDueCandleCacheRetries, markCandleCacheRetrySuccess } from "@/lib/candle-cache-retry";
import { refreshDailyBollingerCaches, refreshDailyGoldenCrossCache } from "@/lib/daily-cache-followup";
import { withAutomationLock } from "@/lib/automation-lock";

let activeWarm: Promise<Awaited<ReturnType<typeof executeWarm>>> | null = null;

export type WarmProgress = { processedCount: number; totalCount: number; successCount: number; failureCount: number; savedCandleCount: number; lastCode?: string; elapsedMs: number; etaMs: number | null };
async function executeWarm(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  const startedAt = new Date().toISOString();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  // The current-day candle is partial during market hours, so refresh it
  // The current-day candle is partial during market hours. Keep the daily
  // lane frequent, while the completed weekly/monthly lanes stay bounded.
  // 주봉은 1일, 월봉은 7일 주기로 KIS 원본을 독립 적재한다.
  const freshness = { D: 60 * 60 * 1000, W: 24 * 60 * 60 * 1000, M: 7 * 24 * 60 * 60 * 1000 } as const;
  const retryRows = await loadDueCandleCacheRetries();
  const retryKeys = new Set(retryRows.map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}:${row.timeframe}`));
  const timeframes = Object.keys(freshness) as Array<keyof typeof freshness>;
  const staleKeysByTimeframe = new Map<keyof typeof freshness, Set<string>>();
  for (const timeframe of timeframes) {
    const stale = await getDb().execute(sql`SELECT u.market, u.code FROM us_common_stock_universe u LEFT JOIN us_instrument_universe_candles c ON c.market = u.market AND c.code = u.code AND c.timeframe = ${timeframe} WHERE u.instrument_type = 'COMMON_STOCK' GROUP BY u.market, u.code HAVING MAX(c.fetched_at) IS NULL OR MAX(c.fetched_at) <= NOW() - (${freshness[timeframe]} * INTERVAL '1 millisecond')`);
    staleKeysByTimeframe.set(timeframe, new Set((stale.rows as Array<{ market: string; code: string }>).map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}`)));
  }
  const dueTimeframes = timeframes.filter((timeframe) => (staleKeysByTimeframe.get(timeframe)?.size ?? 0) > 0 || retryRows.some((row) => row.timeframe === timeframe));
  // A global MAX(fetched_at) cannot prove that every ticker has enough
  // history. Backfill only symbols whose daily cache is below the scanner's
  // minimum history, even when the normal daily timeframe is not due yet.
  const underfilledDaily = new Set<string>();
  const underfilled = await getDb().execute(sql`SELECT u.market, u.code
    FROM us_common_stock_universe u
    LEFT JOIN us_instrument_universe_candles c
      ON c.market = u.market AND c.code = u.code AND c.timeframe = 'D'
    WHERE u.instrument_type = 'COMMON_STOCK'
    GROUP BY u.market, u.code
    HAVING COUNT(c.candle_date) < 35 OR COUNT(*) FILTER (WHERE COALESCE(c.raw_payload, '') = '') > 0`);
  for (const row of underfilled.rows as Array<{ market: string; code: string }>) underfilledDaily.add(`${String(row.market).toUpperCase()}:${String(row.code).toUpperCase()}`);
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  let successCount = 0;
  let dailySuccessCount = 0;
  let candleCount = 0;
  let processedCount = 0;
  const progressStarted = Date.now();
  const failures: Array<{ market: string; code: string; error: string }> = [];
  const laneConcurrency: Record<keyof typeof freshness, number> = {
    D: concurrency,
    W: Math.max(1, Math.min(concurrency, 3)),
    M: Math.max(1, Math.min(concurrency, 2)),
  };
  async function runLane(timeframe: keyof typeof freshness) {
    const laneItems = instruments.filter((item) => {
      const key = `${item.market.toUpperCase()}:${item.code.toUpperCase()}`;
      return retryKeys.has(`${key}:${timeframe}`) || staleKeysByTimeframe.get(timeframe)?.has(key) || (timeframe === "D" && underfilledDaily.has(key));
    });
    let cursor = 0;
    async function worker() {
    while (true) {
      const item = laneItems[cursor++];
      if (!item) return;
      try {
        const response = await fetchUsDailyPrice({ code: item.code, market: item.market, timeframe });
        if (!response?.ok || response.candles.length === 0) {
          const error = `${timeframe}: ${!response ? "KIS access token unavailable" : !response.ok ? `KIS API failed (${response.status})` : "KIS returned no candles"}`;
          failures.push({ market: item.market, code: item.code, error });
          await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error });
        } else {
          candleCount += await saveUsDailyCandles(item.market, item.code, response.candles, timeframe);
          if (timeframe === "D") dailySuccessCount += 1;
          await markCandleCacheRetrySuccess({ market: item.market, code: item.code, timeframe });
        }
          if (response?.ok && response.candles.length > 0) successCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ market: item.market, code: item.code, error: message });
        await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error: message });
      }
      processedCount += 1;
      const elapsedMs = Date.now() - progressStarted;
      options.onProgress?.({ processedCount, totalCount: instruments.length, successCount, failureCount: failures.length, savedCandleCount: candleCount, lastCode: item.code, elapsedMs, etaMs: processedCount ? Math.round(elapsedMs / processedCount * Math.max(0, instruments.length - processedCount)) : null });
    }
    }
    await Promise.all(Array.from({ length: Math.min(laneConcurrency[timeframe], Math.max(1, laneItems.length)) }, worker));
  }
  await Promise.all((Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => dueTimeframes.includes(timeframe)).map(runLane));
  const completedAt = new Date().toISOString();
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  const weeklyDerived = { skipped: true, reason: "US_WEEKLY_USES_KIS_ORIGINAL_CANDLES", source: "KIS" as const };
  // Partial KIS failures must not block follow-up caches for instruments
  // whose candles were saved successfully. The scanners read the DB cache
  // and naturally omit the failed instruments.
  const followupBlocked = successCount === 0;
  const bollingerCache = followupBlocked ? { skipped: true, reason: "no_successful_daily_candles", failureCount: failures.length } : await refreshDailyBollingerCaches("US");
  const goldenCrossCache = followupBlocked ? { skipped: true, reason: "no_successful_daily_candles", failureCount: failures.length } : await refreshDailyGoldenCrossCache("US");
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, dueTimeframes, dailySuccessCount, weeklyDerived, backfillDailyCount: underfilledDaily.size, skippedTimeframes: (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !dueTimeframes.includes(timeframe)), startedAt, completedAt, durationMs, durationSeconds: Number((durationMs / 1000).toFixed(2)), instrumentCount: instruments.length, concurrency, successCount, failureCount: failures.length, savedCandleCount: candleCount, failures, bollingerCache, goldenCrossCache };
}

export function warmUsDailyPriceCache(options: { concurrency?: number; onProgress?: (progress: WarmProgress) => void } = {}) {
  if (!activeWarm) activeWarm = withAutomationLock("us-daily-cache-worker", async () => {
    const result = await executeWarm(options);
    return result;
  }).then((result) => {
    if (!result) throw new Error("US candle cache worker is already running");
    return result;
  }).finally(() => { activeWarm = null; });
  return activeWarm;
}
