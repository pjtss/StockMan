import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL, US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL_WITH_PREFILTER } from "@/lib/us-depositary-receipt-classification";
import { loadFeatureDiscordDebugWebhook } from "@/lib/discord-config";
import { fetchKrDailyPrice } from "@/lib/kis-kr-daily-price";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { parseServerJournalOptions, readServerJournal } from "@/lib/server-journal";
import { getRecentPublicDailyExportTimings } from "@/lib/public-daily-export-timing";

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
  if (searchParams.get("exportTimingsOnly") === "true") {
    return NextResponse.json({
      ok: true,
      market,
      checkedAt: new Date().toISOString(),
      exportTimings: getRecentPublicDailyExportTimings(market),
    }, { headers: { "cache-control": "no-store" } });
  }
  if (searchParams.get("exportActivityOnly") === "true") {
    try {
      const activity = await getPool().query<{
        visible_session_count: number;
        visible_active_session_count: number;
        query_hidden_session_count: number;
        active_exporter_queries: Array<{
          wait_event_type: string | null;
          wait_event: string | null;
          active_count: number;
          oldest_active_seconds: number;
          average_active_seconds: number;
        }> | string;
      }>(`WITH sessions AS (
            SELECT state, query, query_start, wait_event_type, wait_event
              FROM pg_stat_activity
             WHERE datname = current_database() AND pid <> pg_backend_pid()
          ), exporter_groups AS (
              SELECT wait_event_type, wait_event, COUNT(*)::int AS active_count,
                     MAX(EXTRACT(EPOCH FROM (NOW() - query_start)))::int AS oldest_active_seconds,
                     AVG(EXTRACT(EPOCH FROM (NOW() - query_start)))::int AS average_active_seconds
                FROM sessions
               WHERE state = 'active' AND query ILIKE $1
               GROUP BY wait_event_type, wait_event
          )
          SELECT (SELECT COUNT(*)::int FROM sessions) AS visible_session_count,
                 (SELECT COUNT(*) FILTER (WHERE state = 'active')::int FROM sessions) AS visible_active_session_count,
                 (SELECT COUNT(*) FILTER (WHERE query IS NULL)::int FROM sessions) AS query_hidden_session_count,
                 COALESCE((SELECT json_agg(json_build_object(
                   'wait_event_type', wait_event_type,
                   'wait_event', wait_event,
                   'active_count', active_count,
                   'oldest_active_seconds', oldest_active_seconds,
                   'average_active_seconds', average_active_seconds
                 )) FROM exporter_groups), '[]'::json) AS active_exporter_queries`,
      [`%public-daily-export-market: ${market.toLowerCase()}%`]);
      const activityRow = activity.rows[0];
      const exporterQueries = typeof activityRow?.active_exporter_queries === "string"
        ? JSON.parse(activityRow.active_exporter_queries)
        : activityRow?.active_exporter_queries ?? [];
      return NextResponse.json({
        ok: true,
        market,
        checkedAt: new Date().toISOString(),
        activityVisibility: {
          visibleSessionCount: Number(activityRow?.visible_session_count ?? 0),
          visibleActiveSessionCount: Number(activityRow?.visible_active_session_count ?? 0),
          queryHiddenSessionCount: Number(activityRow?.query_hidden_session_count ?? 0),
        },
        activeExporterQueries: exporterQueries.map((row: {
          wait_event_type: string | null;
          wait_event: string | null;
          active_count: number;
          oldest_active_seconds: number;
          average_active_seconds: number;
        }) => ({
          waitEventType: row.wait_event_type,
          waitEvent: row.wait_event,
          activeCount: Number(row.active_count),
          oldestActiveSeconds: Number(row.oldest_active_seconds),
          averageActiveSeconds: Number(row.average_active_seconds),
        })),
      }, { headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, market, error: "EXPORT_ACTIVITY_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  if (searchParams.get("exportStorageOnly") === "true") {
    const candleTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
    try {
      const pool = getPool();
      const tableResult = await pool.query<Record<string, string | number>>(`SELECT pg_total_relation_size(c.oid)::bigint AS table_bytes,
                   pg_relation_size(c.oid)::bigint AS heap_bytes,
                   pg_indexes_size(c.oid)::bigint AS index_bytes,
                   COALESCE(s.n_live_tup, c.reltuples)::bigint AS estimated_live_rows,
                   c.relpages::bigint AS heap_pages,
                   c.relallvisible::bigint AS all_visible_pages,
                   COALESCE(io.heap_blks_read, 0)::bigint AS heap_blocks_read,
                   COALESCE(io.heap_blks_hit, 0)::bigint AS heap_blocks_hit,
                   COALESCE(io.idx_blks_read, 0)::bigint AS index_blocks_read,
                   COALESCE(io.idx_blks_hit, 0)::bigint AS index_blocks_hit
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
              LEFT JOIN pg_statio_user_tables io ON io.relid = c.oid
             WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`, [candleTable]);
      const indexResult = await pool.query<{
        index_name: string;
        index_bytes: string | number;
        is_valid: boolean;
        is_ready: boolean;
        definition: string;
        predicate: string | null;
      }>(`SELECT ci.relname AS index_name,
                   pg_relation_size(ci.oid)::bigint AS index_bytes,
                   i.indisvalid AS is_valid,
                   i.indisready AS is_ready,
                   pg_get_indexdef(ci.oid) AS definition,
                   pg_get_expr(i.indpred, i.indrelid) AS predicate
              FROM pg_index i
              JOIN pg_class ct ON ct.oid = i.indrelid
              JOIN pg_class ci ON ci.oid = i.indexrelid
              JOIN pg_namespace n ON n.oid = ct.relnamespace
             WHERE n.nspname = 'public' AND ct.relname = $1
             ORDER BY pg_relation_size(ci.oid) DESC`, [candleTable]);
      const extensionResult = await pool.query<{ available: boolean }>(`SELECT to_regclass('pg_stat_statements') IS NOT NULL AS available`);
      let statementStatsStatus: "available" | "unavailable" | "permission_denied" = "unavailable";
      let statementStats: Array<Record<string, unknown>> = [];
      if (extensionResult.rows[0]?.available) {
        try {
          const stats = await pool.query<Record<string, string | number>>(`SELECT queryid, calls, rows, total_exec_time, mean_exec_time,
                     shared_blks_hit, shared_blks_read, temp_blks_read, temp_blks_written
                FROM pg_stat_statements
               WHERE query ILIKE $1
               ORDER BY total_exec_time DESC
               LIMIT 10`, [`%${candleTable}%`]);
          statementStats = stats.rows.map((row) => ({
            queryId: String(row.queryid),
            calls: Number(row.calls),
            rows: Number(row.rows),
            totalExecutionMs: Number(row.total_exec_time),
            meanExecutionMs: Number(row.mean_exec_time),
            sharedBlocksHit: Number(row.shared_blks_hit),
            sharedBlocksRead: Number(row.shared_blks_read),
            tempBlocksRead: Number(row.temp_blks_read),
            tempBlocksWritten: Number(row.temp_blks_written),
          }));
          statementStatsStatus = "available";
        } catch {
          statementStatsStatus = "permission_denied";
        }
      }
      const row = tableResult.rows[0];
      if (!row) return NextResponse.json({ ok: false, market, error: "EXPORT_STORAGE_METADATA_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
      const heapPages = Number(row.heap_pages);
      const allVisiblePages = Number(row.all_visible_pages);
      return NextResponse.json({
        ok: true,
        market,
        tableName: candleTable,
        checkedAt: new Date().toISOString(),
        table: {
          totalBytes: Number(row.table_bytes),
          heapBytes: Number(row.heap_bytes),
          indexBytes: Number(row.index_bytes),
          estimatedLiveRows: Number(row.estimated_live_rows),
          heapPages,
          allVisiblePages,
          allVisiblePercent: heapPages > 0 ? Number((allVisiblePages * 100 / heapPages).toFixed(2)) : null,
          cumulativeHeapBlocksRead: Number(row.heap_blocks_read),
          cumulativeHeapBlocksHit: Number(row.heap_blocks_hit),
          cumulativeIndexBlocksRead: Number(row.index_blocks_read),
          cumulativeIndexBlocksHit: Number(row.index_blocks_hit),
        },
        indexes: indexResult.rows.map((index) => ({
          name: index.index_name,
          bytes: Number(index.index_bytes),
          valid: index.is_valid,
          ready: index.is_ready,
          definition: index.definition,
          predicate: index.predicate,
        })),
        pgStatStatements: { status: statementStatsStatus, statements: statementStats },
      }, { headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, market, error: "EXPORT_STORAGE_DIAGNOSTICS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  if (searchParams.get("exportSummaryPlanOnly") === "true" || searchParams.get("exportSummaryAnalyzeOnly") === "true") {
    const analyze = searchParams.get("exportSummaryAnalyzeOnly") === "true";
    const tickerLimit = analyze ? 100 : 1_000;
    const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
    const eligibility = market === "KR"
      ? "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false"
      : `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL_WITH_PREFILTER}`;
    const format = searchParams.get("format") === "full" ? "full" : "compact";
    const candleColumn = format === "compact" ? "compact_candles" : "full_candles";
    const candleSchema = format === "compact"
      ? ", 'candleEncoding', 'tuple-v1', 'candleFields', json_build_array('date', 'open', 'high', 'low', 'close', 'volume', 'tradingValue', 'fetchedAt')"
      : "";
    try {
      const pool = getPool();
      const keys = await pool.query<{ market: string; code: string; name: string }>(`
        SELECT u.market, u.code, u.name
          FROM ${universeTable} u
         WHERE ${eligibility}
         ORDER BY u.market, u.code
         LIMIT ${tickerLimit}`);
      if (keys.rows.length === 0) return NextResponse.json({ ok: false, market, error: "EXPORT_SUMMARY_UNIVERSE_EMPTY" }, { status: 503, headers: { "cache-control": "no-store" } });
      const explainOptions = analyze ? "ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON" : "FORMAT JSON";
      const planResult = await pool.query<{ "QUERY PLAN": unknown }>(`EXPLAIN (${explainOptions})
        /* public-daily-export-market: ${market.toLowerCase()} */
        WITH requested AS (
          SELECT market, code, name
            FROM jsonb_to_recordset($1::jsonb) AS item(market text, code text, name text)
        )
        SELECT '[' || COALESCE(string_agg(row_to_json(payload)::text, ',' ORDER BY r.market, r.code), '') || ']' AS items_json
          FROM requested r
          LEFT JOIN instrument_fundamental_snapshots f
            ON f.market = r.market AND f.code = r.code
          LEFT JOIN public_daily_export_candle_summaries d
            ON d.market = r.market AND d.code = r.code
          CROSS JOIN LATERAL (
            SELECT json_build_object('market', r.market, 'code', r.code, 'name', r.name) AS ticker,
                   json_build_object(
                     'value', CASE WHEN f.market_cap > 0 AND f.market_cap < '1.7976931348623157e308'::double precision THEN f.market_cap ELSE NULL END,
                     'currency', COALESCE(NULLIF(f.currency, ''), CASE WHEN r.market IN ('KOSPI', 'KOSDAQ') THEN 'KRW' ELSE 'USD' END),
                     'observedAt', CASE WHEN f.observed_at IS NULL THEN NULL ELSE to_char(f.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                     'fetchedAt', CASE WHEN f.fetched_at IS NULL THEN NULL ELSE to_char(f.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
                   ) AS "marketCap",
                   json_build_object(
                     'candles', COALESCE(d.${candleColumn}, '[]'::json)${candleSchema},
                     'metadata', json_build_object(
                       'latestCandleDate', d.latest_candle_date,
                       'dataUpdatedAt', CASE WHEN d.data_updated_at IS NULL THEN NULL ELSE to_char(d.data_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                       'returnedCount', COALESCE(d.returned_count, 0)::int
                     )
                   ) AS daily
          ) payload`, [JSON.stringify(keys.rows)]);
      return NextResponse.json({ ok: true, market, format, checkedAt: new Date().toISOString(), plannedTickerCount: keys.rows.length, executed: analyze, plan: planResult.rows[0]?.["QUERY PLAN"] ?? null }, { headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, market, error: "EXPORT_SUMMARY_DIAGNOSTICS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  if (searchParams.get("exportPlanOnly") === "true" || searchParams.get("exportAnalyzeOnly") === "true") {
    const analyze = searchParams.get("exportAnalyzeOnly") === "true";
    const tickerLimit = analyze ? 100 : 1_000;
    const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
    const candleTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
    const eligibility = market === "KR"
      ? "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false"
      : `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL}`;
    try {
      const pool = getPool();
      const keys = await pool.query<{ market: string; code: string; name: string; has_trading_value: boolean }>(`
        SELECT u.market, u.code, u.name,
               EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.${candleTable}'::regclass AND a.attname = 'trading_value' AND NOT a.attisdropped) AS has_trading_value
          FROM ${universeTable} u
         WHERE ${eligibility}
         ORDER BY u.market, u.code
         LIMIT ${tickerLimit}`);
      if (keys.rows.length === 0) return NextResponse.json({ ok: false, market, error: "EXPORT_PLAN_UNIVERSE_EMPTY" }, { status: 503, headers: { "cache-control": "no-store" } });
      const tradingValueExpression = keys.rows[0].has_trading_value
        ? market === "KR"
          ? `CASE WHEN c.trading_value > '-Infinity' AND c.trading_value < 'Infinity' THEN c.trading_value::double precision ELSE c.close * c.volume END`
          : `CASE WHEN c.trading_value::text ~ '^[+-]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' THEN c.trading_value::double precision ELSE c.close * c.volume END`
        : "c.close * c.volume";
      const explainOptions = analyze ? "ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON" : "FORMAT JSON";
      const planResult = await pool.query<{ "QUERY PLAN": unknown }>(`EXPLAIN (${explainOptions})
        /* public-daily-export-market: ${market.toLowerCase()} */
        SELECT r.market, r.code,
               (SELECT json_agg(json_build_array(recent.candle_date, recent.open, recent.high, recent.low, recent.close, recent.volume, recent.trading_value, recent.fetched_at) ORDER BY recent.candle_date ASC)
                  FROM (
                    SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume,
                           ${tradingValueExpression} AS trading_value, c.fetched_at
                      FROM ${candleTable} c
                     WHERE c.market = r.market AND c.code = r.code AND c.timeframe = 'D'
                       AND ${validDailyCandleSql("c")}
                     ORDER BY c.candle_date DESC
                     LIMIT 20
                  ) recent) AS candles
          FROM jsonb_to_recordset($1::jsonb) AS r(market text, code text, name text)
         ORDER BY r.market, r.code`, [JSON.stringify(keys.rows.map(({ market: keyMarket, code, name }) => ({ market: keyMarket, code, name })))]);
      return NextResponse.json({ ok: true, market, checkedAt: new Date().toISOString(), plannedTickerCount: keys.rows.length, executed: analyze, plan: planResult.rows[0]?.["QUERY PLAN"] ?? null }, { headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, market, error: "EXPORT_PLAN_DIAGNOSTICS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
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
