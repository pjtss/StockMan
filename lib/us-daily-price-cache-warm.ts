import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { recordCandleCacheFailure } from "@/lib/candle-cache-failure-history";
import { loadDueCandleCacheRetries, markCandleCacheRetrySuccess } from "@/lib/candle-cache-retry";
import { refreshDailyBollingerCaches, refreshDailyGoldenCrossCache } from "@/lib/daily-cache-followup";
import { withAutomationLock } from "@/lib/automation-lock";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";

let activeWarm: Promise<Awaited<ReturnType<typeof executeWarm>>> | null = null;

export type WarmProgress = { processedCount: number; totalCount: number; successCount: number; failureCount: number; savedCandleCount: number; lastCode?: string; elapsedMs: number; etaMs: number | null };
type WarmOptions = { concurrency?: number; onProgress?: (progress: WarmProgress) => void; timeframes?: ReadonlyArray<"D" | "W" | "M"> };
async function executeWarm(options: WarmOptions = {}) {
  const startedAt = new Date().toISOString();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  // The current-day candle is partial during market hours, so refresh it
  // The current-day candle is partial during market hours. Keep the daily
  // lane frequent, while the completed weekly/monthly lanes stay bounded.
  // 주봉은 1일, 월봉은 7일 주기로 KIS 원본을 독립 적재한다.
  const freshness = { D: 60 * 60 * 1000, W: 24 * 60 * 60 * 1000, M: 7 * 24 * 60 * 60 * 1000 } as const;
  const retryRows = await loadDueCandleCacheRetries(instruments);
  const retryKeys = new Set(retryRows.map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}:${row.timeframe}`));
  const retryTimeframes = new Set(retryRows.map((row) => row.timeframe));
  const allTimeframes = Object.keys(freshness) as Array<keyof typeof freshness>;
  const timeframes = options.timeframes ? allTimeframes.filter((timeframe) => options.timeframes?.includes(timeframe)) : allTimeframes;
  const staleKeysByTimeframe = new Map<keyof typeof freshness, Set<string>>();
  // The refresh indexes support these three bounded scans. Keep the lanes
  // sequential to respect the upstream quota, but determine all due sets in
  // parallel so DB planning does not add latency before the first request.
  await Promise.all(timeframes.map(async (timeframe) => {
    const latestTable = timeframe === "D" ? "us_latest_daily_candles" : "us_instrument_universe_candles";
    const timeframeFilter = timeframe === "D" ? "" : ` AND c.timeframe = '${timeframe}'`;
    const stale = await getDb().execute(sql.raw(timeframe === "D" ? `SELECT u.market, u.code
      FROM us_common_stock_universe u
      LEFT JOIN us_latest_daily_candles latest ON latest.market = u.market AND latest.code = u.code AND ${validDailyCandleSql("latest")}
      CROSS JOIN (SELECT MAX(s.candle_date) AS candle_date FROM us_latest_daily_candles s WHERE ${validDailyCandleSql("s")}) market_latest
      WHERE u.enabled = true
        AND u.instrument_type = 'COMMON_STOCK'
        AND COALESCE(u.is_etf, false) = false
        AND COALESCE(u.is_warrant, false) = false
        AND COALESCE(u.is_derivative, false) = false
        AND COALESCE(u.is_dr, false) = false
        AND COALESCE(u.is_leveraged, false) = false
        AND COALESCE(u.is_inverse, false) = false
        AND (latest.fetched_at IS NULL
          OR latest.fetched_at <= NOW() - (${freshness[timeframe]} * INTERVAL '1 millisecond')
          OR latest.candle_date < market_latest.candle_date)` : `SELECT u.market, u.code
      FROM us_common_stock_universe u
      LEFT JOIN LATERAL (
        SELECT c.fetched_at, c.candle_date
        FROM ${latestTable} c
        WHERE c.market = u.market AND c.code = u.code${timeframeFilter} AND ${validDailyCandleSql("c")}
        ORDER BY c.candle_date DESC, c.fetched_at DESC
        LIMIT 1
      ) latest ON true
      WHERE u.enabled = true
        AND u.instrument_type = 'COMMON_STOCK'
        AND COALESCE(u.is_etf, false) = false
        AND COALESCE(u.is_warrant, false) = false
        AND COALESCE(u.is_derivative, false) = false
        AND COALESCE(u.is_dr, false) = false
        AND COALESCE(u.is_leveraged, false) = false
        AND COALESCE(u.is_inverse, false) = false
        AND (latest.fetched_at IS NULL
          OR latest.fetched_at <= NOW() - (${freshness[timeframe]} * INTERVAL '1 millisecond'))`));
    staleKeysByTimeframe.set(timeframe, new Set((stale.rows as Array<{ market: string; code: string }>).map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}`)));
  }));
  const dueTimeframes = timeframes.filter((timeframe) => (staleKeysByTimeframe.get(timeframe)?.size ?? 0) > 0 || retryTimeframes.has(timeframe));
  // A global MAX(fetched_at) cannot prove that every ticker has enough
  // history. Backfill only symbols whose daily cache is below the scanner's
  // minimum history, even when the normal daily timeframe is not due yet.
  const underfilledDaily = new Set<string>();
  const underfilled = await getDb().execute(sql`SELECT u.market, u.code
    FROM us_common_stock_universe u
    WHERE u.enabled = true
      AND u.instrument_type = 'COMMON_STOCK'
      AND COALESCE(u.is_etf, false) = false
      AND COALESCE(u.is_warrant, false) = false
      AND COALESCE(u.is_derivative, false) = false
      AND COALESCE(u.is_dr, false) = false
      AND COALESCE(u.is_leveraged, false) = false
      AND COALESCE(u.is_inverse, false) = false
      AND (
        NOT EXISTS (
          SELECT 1
          FROM us_instrument_universe_candles c
          WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'D'
            AND ${sql.raw(validDailyCandleSql("c"))}
          LIMIT 1 OFFSET 34
        )
        OR EXISTS (
          SELECT 1
          FROM us_instrument_universe_candles c
          WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'D'
            AND ${sql.raw(validDailyCandleSql("c"))}
            AND COALESCE(c.raw_payload, '') = ''
          LIMIT 1
        )
      )`);
  for (const row of underfilled.rows as Array<{ market: string; code: string }>) underfilledDaily.add(`${String(row.market).toUpperCase()}:${String(row.code).toUpperCase()}`);
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  let successCount = 0;
  let dailySuccessCount = 0;
  let candleCount = 0;
  let discardedOrDuplicateCandleCount = 0;
  let dbWriteDurationMs = 0;
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
      const key = `${item.market.toUpperCase()}:${item.code.toUpperCase()}`;
      const claimedRetry = retryRows.find((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}:${row.timeframe}` === `${key}:${timeframe}`);
      try {
        const response = await fetchUsDailyPrice({ code: item.code, market: item.market, timeframe });
        if (!response?.ok || response.candles.length === 0) {
          const error = `${timeframe}: ${!response ? "KIS access token unavailable" : !response.ok ? `KIS API failed (${response.status})` : "KIS returned no candles"}`;
          const failure = { market: item.market, code: item.code, error, retryQueued: true };
          failures.push(failure);
          try { failure.retryQueued = await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, expectedAttempts: claimedRetry?.attempts, error }); }
          catch (queueError) { failure.retryQueued = false; failure.error += `; retry persistence failed: ${queueError instanceof Error ? queueError.message : String(queueError)}`; }
        } else {
          const dbWriteStartedAt = Date.now();
          let savedCount = 0;
          try {
            savedCount = await saveUsDailyCandles(item.market, item.code, response.candles, timeframe);
            candleCount += savedCount;
          } finally {
            dbWriteDurationMs += Date.now() - dbWriteStartedAt;
          }
          response.diagnostics.savedCandleCount = savedCount;
          response.diagnostics.discardedOrDuplicateCandleCount = Math.max(0, response.candles.length - savedCount);
          discardedOrDuplicateCandleCount += response.diagnostics.discardedOrDuplicateCandleCount;
          if (savedCount === 0) {
            const error = `${timeframe}: KIS returned candles but no valid rows were saved`;
            const failure = { market: item.market, code: item.code, error, retryQueued: true };
            failures.push(failure);
            try { failure.retryQueued = await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, expectedAttempts: claimedRetry?.attempts, error }); }
            catch (queueError) { failure.retryQueued = false; failure.error += `; retry persistence failed: ${queueError instanceof Error ? queueError.message : String(queueError)}`; }
          } else {
            if (timeframe === "D") dailySuccessCount += 1;
            if (claimedRetry && !await markCandleCacheRetrySuccess({ market: item.market, code: item.code, timeframe, attempts: claimedRetry.attempts })) failures.push({ market: item.market, code: item.code, error: `${timeframe}: retry success marker not updated (stale claim or database error)` });
            successCount += 1;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure = { market: item.market, code: item.code, error: message, retryQueued: true };
        failures.push(failure);
        try { failure.retryQueued = await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, expectedAttempts: claimedRetry?.attempts, error: message }); }
        catch (queueError) { failure.retryQueued = false; failure.error += `; retry persistence failed: ${queueError instanceof Error ? queueError.message : String(queueError)}`; }
      }
      processedCount += 1;
      const elapsedMs = Date.now() - progressStarted;
      options.onProgress?.({ processedCount, totalCount: instruments.length, successCount, failureCount: failures.length, savedCandleCount: candleCount, lastCode: item.code, elapsedMs, etaMs: processedCount ? Math.round(elapsedMs / processedCount * Math.max(0, instruments.length - processedCount)) : null });
    }
    }
    await Promise.all(Array.from({ length: Math.min(laneConcurrency[timeframe], Math.max(1, laneItems.length)) }, worker));
  }
  for (const timeframe of ["D", "W", "M"] as const) {
    if (dueTimeframes.includes(timeframe)) await runLane(timeframe);
  }
  const completedAt = new Date().toISOString();
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  const universeAvailable = Boolean((universe.universe as any).ok) && instruments.length > 0;
  const weeklyDerived = { skipped: true, reason: "US_WEEKLY_USES_KIS_ORIGINAL_CANDLES", source: "KIS" as const };
  // Partial KIS failures must not block follow-up caches for instruments
  // whose candles were saved successfully. The scanners read the DB cache
  // and naturally omit the failed instruments.
  // Indicator follow-ups consume the daily candle cache. Weekly/monthly
  // success must not make them run when every daily request failed.
  const followupBlocked = dailySuccessCount === 0;
  const skippedFollowup = { skipped: true, reason: "no_successful_daily_candles", failureCount: failures.length };
  const [bollingerCache, goldenCrossCache] = followupBlocked
    ? [skippedFollowup, skippedFollowup]
    : await Promise.all([refreshDailyBollingerCaches("US"), refreshDailyGoldenCrossCache("US")]);
  return { ok: universeAvailable && failures.length === 0, status: universeAvailable ? undefined : "FAILED", universeAvailable, universe: universe.universe, dueTimeframes, dailySuccessCount, weeklyDerived, backfillDailyCount: underfilledDaily.size, skippedTimeframes: (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !dueTimeframes.includes(timeframe)), startedAt, completedAt, durationMs, durationSeconds: Number((durationMs / 1000).toFixed(2)), instrumentCount: instruments.length, concurrency, successCount, failureCount: failures.length, savedCandleCount: candleCount, discardedOrDuplicateCandleCount, dbWriteDurationMs, failures, bollingerCache, goldenCrossCache };
}

export function warmUsDailyPriceCache(options: WarmOptions = {}) {
  if (!activeWarm) activeWarm = withAutomationLock("us-daily-cache-worker", async () => {
    const result = await executeWarm(options);
    return result;
  }).then((result) => {
    if (!result) throw new Error("US candle cache worker is already running");
    return result;
  }).finally(() => { activeWarm = null; });
  return activeWarm;
}
