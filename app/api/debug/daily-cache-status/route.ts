import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL } from "@/lib/us-depositary-receipt-classification";
import { loadFeatureDiscordDebugWebhook } from "@/lib/discord-config";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { parseServerJournalOptions, readServerJournal } from "@/lib/server-journal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARKET_CONFIG = {
  KR: {
    module: "kr-daily-cache",
    universe: "kr_common_stock_universe",
    cache: "kr_latest_daily_candles",
    predicate: "u.enabled = true AND u.instrument_type = 'COMMON_STOCK' AND u.is_etp = false AND u.is_warrant = false AND u.is_preferred = false",
  },
  US: {
    module: "us-daily-cache",
    universe: "us_common_stock_universe",
    cache: "us_latest_daily_candles",
    predicate: `u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK' AND COALESCE(u.is_etf, false) = false AND COALESCE(u.is_warrant, false) = false AND COALESCE(u.is_derivative, false) = false AND COALESCE(u.is_dr, false) = false AND COALESCE(u.is_leveraged, false) = false AND COALESCE(u.is_inverse, false) = false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL}`,
  },
} as const;

async function readAdvisoryLockStatus(key: string) {
  const result = await getPool().query<{
    granted: boolean;
    state: string | null;
    wait_event_type: string | null;
    wait_event: string | null;
    application_name: string | null;
    backend_pid: number | null;
    backend_age_seconds: number | null;
    transaction_age_seconds: number | null;
  }>(`WITH lock_key AS (SELECT hashtext($1)::bigint AS value)
    SELECT l.granted, a.state, a.wait_event_type, a.wait_event, a.application_name, a.pid AS backend_pid,
           EXTRACT(EPOCH FROM (NOW() - a.backend_start))::int AS backend_age_seconds,
           EXTRACT(EPOCH FROM (NOW() - a.xact_start))::int AS transaction_age_seconds
      FROM pg_locks l CROSS JOIN lock_key k
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE l.locktype = 'advisory'
       AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND l.objsubid = 1
       AND l.classid = ((k.value >> 32) & 4294967295)::oid
       AND l.objid = (k.value & 4294967295)::oid
     ORDER BY l.granted DESC, a.backend_start ASC`, [key]);
  const holders = result.rows.map((row) => ({
    granted: row.granted,
    state: row.state,
    waitEventType: row.wait_event_type,
    waitEvent: row.wait_event,
    applicationName: row.application_name,
    backendPid: row.backend_pid == null ? null : Number(row.backend_pid),
    backendAgeSeconds: row.backend_age_seconds == null ? null : Number(row.backend_age_seconds),
    transactionAgeSeconds: row.transaction_age_seconds == null ? null : Number(row.transaction_age_seconds),
  }));
  return { held: holders.some((row) => row.granted), sessions: holders };
}

function compactRunSummary(value: unknown) {
  const summary = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : value;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  const source = summary as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["instrumentCount", "processedCount", "successCount", "failureCount", "dailySuccessCount", "dailySavedCandleCount", "savedCandleCount", "discardedOrDuplicateCandleCount", "partialFailureCount", "durationMs", "durationSeconds", "dueTimeframes", "skippedTimeframes"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  const diagnostics = source.diagnostics as Record<string, unknown> | undefined;
  if (diagnostics && typeof diagnostics === "object") result.errorCode = diagnostics.errorCode ?? null;
  const notifications = source.notifications as Record<string, unknown> | undefined;
  const completion = notifications?.completion as Record<string, unknown> | undefined;
  if (completion && typeof completion === "object") result.discordNotification = { sent: completion.sent ?? null, skipped: completion.skipped ?? null, reason: completion.reason ?? null };
  if (Array.isArray(source.dailyCoverage)) {
    result.dailyCoverage = source.dailyCoverage.slice(0, 5).map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { market: row.market, latestDate: row.latestMarketDate ?? row.latestDate, latestDateCount: row.latestDateCount, eligibleCount: row.eligibleCount, gapCount: row.gapCount, latestFetchedAt: row.latestFetchedAt };
    });
  }
  return result;
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
  const market = new URL(request.url).searchParams.get("market")?.trim().toUpperCase() as keyof typeof MARKET_CONFIG | undefined;
  if (market !== "KR" && market !== "US") return NextResponse.json({ ok: false, error: "INVALID_MARKET", supportedMarkets: ["KR", "US"] }, { status: 400, headers: { "cache-control": "no-store" } });

  const config = MARKET_CONFIG[market];
  const searchParams = new URL(request.url).searchParams;
  const includeServerLogs = searchParams.get("includeServerLogs") === "true";
  const serverJournalOptions = includeServerLogs ? parseServerJournalOptions(searchParams) : null;
  if (includeServerLogs && serverJournalOptions == null) {
    return NextResponse.json({ ok: false, error: "INVALID_SERVER_LOG_QUERY", supportedUnits: ["stockman.service", "stockman-cron.service", "stockman-rss.service", "stockman-fundamentals.service", "nginx.service", "nginx-access"], logMinutesRange: [1, 1440], logLimitRange: [1, 100] }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (searchParams.get("logsOnly") === "true") {
    if (!serverJournalOptions) return NextResponse.json({ ok: false, error: "SERVER_LOG_QUERY_REQUIRED" }, { status: 400, headers: { "cache-control": "no-store" } });
    const serverLogs = await readServerJournal(serverJournalOptions);
    return NextResponse.json({ ok: true, market, checkedAt: new Date().toISOString(), serverLogs }, { headers: { "cache-control": "no-store" } });
  }
  const serverLogsPromise = serverJournalOptions
    ? readServerJournal(serverJournalOptions).catch(() => undefined)
    : undefined;
  try {
    const [settings, globalGateEnabled, debugWebhookConfigured, coverage, recentDates, retries, failures, runs, refreshLock, workerLock] = await Promise.all([
      loadFeatureModuleSettings(config.module),
      isDailyCandleAutomationEnabled(),
      loadFeatureDiscordDebugWebhook(config.module).then(Boolean),
      getPool().query(`WITH eligible AS (
        SELECT u.market, u.code FROM ${config.universe} u WHERE ${config.predicate}
      ), market_latest AS (
        SELECT c.market, MAX(c.candle_date) AS latest_date FROM ${config.cache} c
         WHERE ${validDailyCandleSql("c")} GROUP BY c.market
      )
      SELECT e.market, COUNT(*)::int AS eligible_count, COUNT(c.code)::int AS cached_count,
             COUNT(*) FILTER (WHERE c.candle_date = ml.latest_date)::int AS latest_date_count,
             COUNT(*) FILTER (WHERE c.code IS NULL OR c.candle_date < ml.latest_date)::int AS behind_latest_count,
             ml.latest_date AS latest_market_date, MAX(c.fetched_at) AS latest_fetched_at,
             MIN(c.fetched_at) AS oldest_current_latest_fetched_at
        FROM eligible e
        LEFT JOIN ${config.cache} c ON c.market = e.market AND c.code = e.code AND ${validDailyCandleSql("c")}
        LEFT JOIN market_latest ml ON ml.market = e.market
       GROUP BY e.market, ml.latest_date ORDER BY e.market`),
      getPool().query(`SELECT market, candle_date, COUNT(*)::int AS candle_count, MAX(fetched_at) AS latest_fetched_at
        FROM ${config.cache} c WHERE ${validDailyCandleSql("c")}
          AND candle_date >= to_char((NOW() AT TIME ZONE 'UTC') - INTERVAL '14 days', 'YYYYMMDD')
        GROUP BY market, candle_date ORDER BY market, candle_date DESC`),
      getPool().query(`SELECT market, timeframe, status, COUNT(*)::int AS count,
          MAX(attempts)::int AS max_attempts, MIN(next_attempt_at) AS next_attempt_at,
          MAX(updated_at) AS latest_updated_at
        FROM instrument_candle_cache_retries WHERE market IN (${market === "KR" ? "'KOSPI','KOSDAQ'" : "'NAS','NYS','AMS'"})
        GROUP BY market, timeframe, status ORDER BY market, timeframe, status`),
      getPool().query(`SELECT market, timeframe,
          CASE WHEN error ~* '(timeout|timed out|ETIMEDOUT)' THEN 'TIMEOUT'
               WHEN error ~* '(401|403|AUTH|token)' THEN 'AUTH_OR_PERMISSION'
               WHEN error ~* '(429|rate limit|EGW00201)' THEN 'RATE_LIMIT'
               WHEN error ~* '(5[0-9][0-9]|ECONN|network|fetch failed)' THEN 'TRANSPORT_OR_UPSTREAM'
               WHEN error ~* '(no valid rows|no usable|discarded)' THEN 'NO_VALID_CANDLES'
               ELSE 'OTHER' END AS error_class,
          COUNT(*)::int AS count, MAX(observed_at) AS latest_observed_at
        FROM instrument_candle_cache_failures
        WHERE observed_at >= NOW() - INTERVAL '24 hours'
          AND market IN (${market === "KR" ? "'KOSPI','KOSDAQ'" : "'NAS','NYS','AMS'"})
          AND timeframe = 'D'
        GROUP BY market, timeframe, error_class ORDER BY market, count DESC`),
      getPool().query(`SELECT id, status, started_at, finished_at, duration_ms, trigger_type, market, timeframe, job_type, retry_count, summary
        FROM automation_runs WHERE module_key = $1 ORDER BY started_at DESC LIMIT 20`, [config.module]),
      readAdvisoryLockStatus(`public-daily-cache-refresh:${config.module}`),
      readAdvisoryLockStatus(market === "KR" ? "kr-daily-cache-worker" : "us-daily-cache-worker"),
    ]);

    let sourceProbe: Array<Record<string, unknown>> | undefined;
    const serverLogs = serverLogsPromise ? await serverLogsPromise : undefined;
    if (searchParams.get("probeSource") === "true") {
      const exchangeMarkets = market === "KR" ? ["KOSPI", "KOSDAQ"] : ["NAS", "NYS", "AMS"];
      sourceProbe = await Promise.all(exchangeMarkets.map(async (exchange) => {
        const anchors = await getPool().query<{ market: string; code: string; cache_latest_date: string | null }>(
          `SELECT u.market, u.code, latest.candle_date AS cache_latest_date
             FROM ${config.universe} u
             LEFT JOIN ${config.cache} latest ON latest.market=u.market AND latest.code=u.code AND ${validDailyCandleSql("latest")}
            WHERE u.market=$1 AND ${config.predicate}
            ORDER BY COALESCE(latest.volume, 0) DESC, u.code
            LIMIT 3`,
          [exchange],
        );
        const attempts: Array<Record<string, unknown>> = [];
        let sourceLatestDate: string | null = null;
        for (const anchor of anchors.rows) {
          try {
            const response = market === "KR"
              ? await fetchKrDailyPrice({ code: anchor.code, timeframe: "D" })
              : await fetchUsDailyPrice({ code: anchor.code, market: exchange, timeframe: "D" });
            const latestDate = response?.ok
              ? response.candles.reduce<string | null>((latest, candle) => !latest || candle.date > latest ? candle.date : latest, null)
              : null;
            attempts.push({ code: anchor.code, httpStatus: response?.status ?? null, sourceLatestDate: latestDate, rtCd: response?.diagnostics?.rtCd ?? null, msgCd: response?.diagnostics?.msgCd ?? null });
            if (latestDate) { sourceLatestDate = latestDate; break; }
          } catch (error) {
            attempts.push({ code: anchor.code, sourceLatestDate: null, errorName: error instanceof Error ? error.name : "UnknownError" });
          }
        }
        const cachedLatestDate = coverage.rows.find((row) => String(row.market) === exchange)?.latest_market_date;
        return { market: exchange, sourceLatestDate, cachedLatestDate: cachedLatestDate == null ? null : String(cachedLatestDate), cacheBehindSource: Boolean(sourceLatestDate && cachedLatestDate && String(cachedLatestDate) < sourceLatestDate), attempts };
      }));
    }
    const now = new Date();
    return NextResponse.json({
      ok: true,
      market,
      checkedAt: now.toISOString(),
      automation: {
        module: config.module,
        globalGateEnabled,
        enabled: settings.enabled,
        debugWebhookConfigured,
        withinConfiguredSchedule: isWithinSchedule(settings, now),
        schedule: { startTime: settings.startTime, endTime: settings.endTime, activeDays: settings.activeDays, intervalSeconds: settings.intervalSeconds ?? null },
      },
      locks: { refresh: refreshLock, worker: workerLock },
      coverage: coverage.rows.map((row) => ({
        market: String(row.market), eligibleCount: Number(row.eligible_count), cachedCount: Number(row.cached_count),
        latestDateCount: Number(row.latest_date_count), behindLatestCount: Number(row.behind_latest_count),
        latestMarketDate: row.latest_market_date == null ? null : String(row.latest_market_date),
        latestFetchedAt: row.latest_fetched_at == null ? null : new Date(row.latest_fetched_at).toISOString(),
        oldestCurrentLatestFetchedAt: row.oldest_current_latest_fetched_at == null ? null : new Date(row.oldest_current_latest_fetched_at).toISOString(),
      })),
      recentDailyDates: recentDates.rows.map((row) => ({ market: String(row.market), date: String(row.candle_date), candleCount: Number(row.candle_count), latestFetchedAt: row.latest_fetched_at == null ? null : new Date(row.latest_fetched_at).toISOString() })),
      retries: retries.rows.map((row) => ({ market: String(row.market), timeframe: String(row.timeframe), status: String(row.status), count: Number(row.count), maxAttempts: Number(row.max_attempts), nextAttemptAt: row.next_attempt_at == null ? null : new Date(row.next_attempt_at).toISOString(), latestUpdatedAt: row.latest_updated_at == null ? null : new Date(row.latest_updated_at).toISOString() })),
      failuresLast24Hours: failures.rows.map((row) => ({ market: String(row.market), timeframe: String(row.timeframe), errorClass: String(row.error_class), count: Number(row.count), latestObservedAt: row.latest_observed_at == null ? null : new Date(row.latest_observed_at).toISOString() })),
      recentRuns: runs.rows.map((row) => ({
        id: Number(row.id), status: String(row.status), startedAt: new Date(row.started_at).toISOString(),
        finishedAt: row.finished_at == null ? null : new Date(row.finished_at).toISOString(),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms), triggerType: String(row.trigger_type),
        market: row.market, timeframe: row.timeframe, jobType: row.job_type, retryCount: Number(row.retry_count ?? 0),
        summary: compactRunSummary(row.summary),
      })),
      ...(sourceProbe ? { sourceProbe } : {}),
      ...(serverLogs ? { serverLogs } : {}),
      notes: ["기본 진단은 DB 상태와 실행 이력만 읽습니다.", "probeSource=true이면 인증된 요청당 거래소별 최대 3개 종목의 KIS 일봉 GET을 실행합니다. DB 기록은 변경하지 않으며 원문 응답·자격증명·webhook URL은 반환하지 않습니다."],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(`[API /debug/daily-cache-status] market=${market} diagnostic query failed:`, error instanceof Error ? error.name : "unknown error");
    const serverLogs = serverLogsPromise ? await serverLogsPromise : undefined;
    return NextResponse.json({ ok: false, market, error: "DAILY_CACHE_DIAGNOSTICS_UNAVAILABLE", ...(serverLogs ? { serverLogs } : {}) }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
