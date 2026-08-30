import { getPool } from "@/lib/db";
import { describeError, type ErrorDiagnostics } from "@/lib/error-diagnostics";
import { FEATURE_MODULES, type FeatureModuleKey } from "@/lib/feature-modules";

const SENSITIVE_KEY = /(appkey|appsecret|access[_-]?token|authorization|webhook|cron[_-]?secret|database[_-]?url|password|private[_-]?key|secret)/i;

export type AutomationDebugFilter = {
  moduleKey?: FeatureModuleKey;
  status?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  failureLimit?: number;
  includeSummary?: boolean;
  staleAfterSeconds?: number;
};

export type AutomationDebugRun = {
  id: number;
  moduleKey: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  stale: boolean;
  observability?: { requestId?: string | null; cronRunId?: string | null; durationMs?: number | null };
  errorDiagnostics?: ErrorDiagnostics;
  summary?: unknown;
  errorMessage: string | null;
  items?: Array<Record<string, unknown>>;
};

type AutomationDebugDbRow = {
  id: number | string;
  module_key: string;
  status: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  duration_ms: number | string | null;
  summary: unknown;
  error_message: string | null;
};

type AutomationDebugStatsRow = {
  total_runs: number | string;
  success_count: number | string;
  partial_count: number | string;
  failed_count: number | string;
  running_count: number | string;
  skipped_count: number | string;
  stale_running_count: number | string;
  average_duration_ms: number | string | null;
  latest_started_at: Date | string | null;
};

type AutomationDebugModuleRow = AutomationDebugStatsRow & { module_key: string };
type AutomationDebugFailureCategoryRow = { error_code: string; count: number | string };
type AutomationDebugSkipReasonRow = { module_key: string; reason: string; count: number | string };

const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

function numeric(value: number | string | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: Date | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Remove credentials from arbitrary JSON summaries without hiding API raw data. */
export function redactDebugValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((child) => redactDebugValue(child));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, redactDebugValue(child, childKey)]));
  }
  return value;
}

export function normalizeAutomationDebugRun(row: AutomationDebugDbRow, includeSummary = true, staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS): AutomationDebugRun {
  const durationMs = numeric(row.duration_ms);
  const stale = row.status === "RUNNING" && durationMs !== null && durationMs >= staleAfterSeconds * 1000;
  const summaryDiagnostics = row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
    ? (row.summary as Record<string, unknown>).diagnostics
    : null;
  const hasSummaryDiagnostics = summaryDiagnostics && typeof summaryDiagnostics === "object" && !Array.isArray(summaryDiagnostics)
    && typeof (summaryDiagnostics as Record<string, unknown>).errorCode === "string"
    && typeof (summaryDiagnostics as Record<string, unknown>).message === "string";
  const summaryObservability = row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
    ? (row.summary as Record<string, unknown>).observability
    : null;
  const normalized: AutomationDebugRun = {
    id: Number(row.id),
    moduleKey: row.module_key,
    status: row.status,
    startedAt: iso(row.started_at) || String(row.started_at),
    finishedAt: iso(row.finished_at),
    durationMs,
    stale,
    errorMessage: row.error_message,
  };
  if (summaryObservability && typeof summaryObservability === "object" && !Array.isArray(summaryObservability)) {
    const value = summaryObservability as Record<string, unknown>;
    normalized.observability = {
      requestId: typeof value.requestId === "string" ? value.requestId : null,
      cronRunId: typeof value.cronRunId === "string" ? value.cronRunId : null,
      durationMs: numeric(typeof value.durationMs === "number" || typeof value.durationMs === "string" ? value.durationMs : null),
    };
  }
  if (hasSummaryDiagnostics) normalized.errorDiagnostics = summaryDiagnostics as ErrorDiagnostics;
  else if (row.error_message) normalized.errorDiagnostics = describeError(row.error_message);
  if (includeSummary) normalized.summary = redactDebugValue(row.summary);
  return normalized;
}

function buildWhere(filter: AutomationDebugFilter, params: unknown[]) {
  const clauses = ["1 = 1"];
  if (filter.moduleKey) {
    params.push(filter.moduleKey);
    clauses.push(`module_key = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filter.since) {
    params.push(filter.since);
    clauses.push(`started_at >= $${params.length}`);
  }
  if (filter.until) {
    params.push(filter.until);
    clauses.push(`started_at < $${params.length}`);
  }
  return clauses.join(" AND ");
}

function moduleDefinitions(filter: AutomationDebugFilter) {
  return filter.moduleKey ? FEATURE_MODULES.filter((module) => module.key === filter.moduleKey) : FEATURE_MODULES;
}

export async function loadAutomationDebugSnapshot(filter: AutomationDebugFilter = {}) {
  const pool = getPool();
  const limit = Math.min(50, Math.max(1, Math.trunc(filter.limit ?? 10)));
  const failureLimit = Math.min(50, Math.max(1, Math.trunc(filter.failureLimit ?? 10)));
  const includeSummary = filter.includeSummary !== false;
  const staleAfterSeconds = Math.min(86_400, Math.max(60, Math.trunc(filter.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS)));

  const statsParams: unknown[] = [];
  const where = buildWhere(filter, statsParams);
  const statsQueryParams = [...statsParams, staleAfterSeconds];
  const stalePlaceholder = `$${statsQueryParams.length}`;
  const statsResult = await pool.query<AutomationDebugStatsRow>(
    `SELECT COUNT(*)::int AS total_runs,
            COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success_count,
            COUNT(*) FILTER (WHERE status = 'PARTIAL')::int AS partial_count,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
            COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running_count,
            COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped_count,
            COUNT(*) FILTER (WHERE status = 'RUNNING' AND started_at < NOW() - (${stalePlaceholder} * INTERVAL '1 second'))::int AS stale_running_count,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) FILTER (WHERE finished_at IS NOT NULL)), 0)::bigint AS average_duration_ms,
            MAX(started_at) AS latest_started_at
       FROM automation_runs
      WHERE ${where}`,
    statsQueryParams,
  );

  const moduleParams = [...statsParams, staleAfterSeconds];
  const moduleResult = await pool.query<AutomationDebugModuleRow>(
    `SELECT module_key,
            COUNT(*)::int AS total_runs,
            COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success_count,
            COUNT(*) FILTER (WHERE status = 'PARTIAL')::int AS partial_count,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
            COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running_count,
            COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped_count,
            COUNT(*) FILTER (WHERE status = 'RUNNING' AND started_at < NOW() - (${stalePlaceholder} * INTERVAL '1 second'))::int AS stale_running_count,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) FILTER (WHERE finished_at IS NOT NULL)), 0)::bigint AS average_duration_ms,
            MAX(started_at) AS latest_started_at
       FROM automation_runs
      WHERE ${where}
      GROUP BY module_key`,
    moduleParams,
  );

  const recentParams = [...statsParams, limit];
  const recentRows = await pool.query<AutomationDebugDbRow>(
    `SELECT id, module_key, status, started_at, finished_at,
            CASE WHEN finished_at IS NULL THEN ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::bigint
                 ELSE ROUND(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::bigint
            END AS duration_ms,
            summary, error_message
       FROM (
         SELECT automation_runs.*,
                ROW_NUMBER() OVER (PARTITION BY module_key ORDER BY started_at DESC) AS row_number
           FROM automation_runs
          WHERE ${where}
       ) runs
      WHERE row_number <= $${recentParams.length}
      ORDER BY started_at DESC`,
    recentParams,
  );
  const recentRunIds = recentRows.rows.map((row) => Number(row.id)).filter(Number.isFinite);
  let itemRows: { rows: Array<Record<string, unknown>> } = { rows: [] };
  if (recentRunIds.length) {
    try { itemRows = await pool.query(`SELECT run_id, market, code, timeframe, status, attempt_count, started_at, completed_at, duration_ms, error_category, error_code, error_message, metadata FROM debug_run_items WHERE run_id = ANY($1::bigint[]) ORDER BY completed_at DESC NULLS LAST`, [recentRunIds]); }
    catch (error) { console.warn("[AutomationDebug] debug_run_items unavailable; continuing without item details:", error instanceof Error ? error.message : error); }
  }
  const itemsByRun = new Map<number, Array<Record<string, unknown>>>();
  for (const row of itemRows.rows) { const key = Number(row.run_id); const items = itemsByRun.get(key) || []; items.push(row); itemsByRun.set(key, items); }

  const failureParams = [...statsParams, failureLimit];
  const failureRows = await pool.query<AutomationDebugDbRow>(
    `SELECT id, module_key, status, started_at, finished_at,
            CASE WHEN finished_at IS NULL THEN ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::bigint
                 ELSE ROUND(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::bigint
            END AS duration_ms,
            summary, error_message
       FROM automation_runs
      WHERE ${where}
        AND status IN ('FAILED', 'PARTIAL')
      ORDER BY started_at DESC
      LIMIT $${failureParams.length}`,
    failureParams,
  );

  const failureCategoryResult = await pool.query<AutomationDebugFailureCategoryRow>(
    `SELECT CASE
              WHEN summary->'diagnostics'->>'errorCode' IS NOT NULL THEN summary->'diagnostics'->>'errorCode'
              WHEN error_message ILIKE '%EGW00201%' OR error_message ILIKE '%초당 거래건수를 초과%' OR error_message ILIKE '%rate limit%' THEN 'KIS_RATE_LIMIT'
              WHEN error_message ILIKE '%EGW00123%' OR error_message ILIKE '%AUTH error%' OR error_message ILIKE '%인증%오류%' THEN 'KIS_AUTH_ERROR'
              WHEN error_message ~* 'Discord.*HTTP[[:space:]]+429' THEN 'DISCORD_WEBHOOK_RATE_LIMIT'
              WHEN error_message ~* 'Discord.*HTTP[[:space:]]+5[0-9]{2}' THEN 'DISCORD_WEBHOOK_SERVER_ERROR'
              ELSE 'INTEGRATION_ERROR'
            END AS error_code,
            COUNT(*)::int AS count
       FROM automation_runs
      WHERE ${where}
        AND status IN ('FAILED', 'PARTIAL')
      GROUP BY 1
      ORDER BY count DESC, error_code` ,
    statsParams,
  );

  const skipReasonResult = await pool.query<AutomationDebugSkipReasonRow>(
    `SELECT module_key,
            COALESCE(NULLIF(summary->>'reason', ''), 'unknown') AS reason,
            COUNT(*)::int AS count
       FROM automation_runs
      WHERE ${where}
        AND status = 'SKIPPED'
      GROUP BY module_key, reason
      ORDER BY count DESC, module_key, reason`,
    statsParams,
  );

  const stats = statsResult.rows[0];
  const moduleStats = new Map(moduleResult.rows.map((row) => [row.module_key, row]));
  const runsByModule = new Map<string, AutomationDebugRun[]>();
  const recentRuns = recentRows.rows.map((row) => {
    const run = normalizeAutomationDebugRun(row, includeSummary, staleAfterSeconds);
    run.items = itemsByRun.get(run.id) || [];
    const runs = runsByModule.get(run.moduleKey) || [];
    runs.push(run);
    runsByModule.set(run.moduleKey, runs);
    return run;
  });
  const modules = moduleDefinitions(filter).map((definition) => {
    const row = moduleStats.get(definition.key);
    const runs = runsByModule.get(definition.key) || [];
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      coverage: row ? "OBSERVED" : "NO_RUN",
      scheduler: definition.scheduler,
      runCount: numeric(row?.total_runs) ?? 0,
      counts: {
        success: numeric(row?.success_count) ?? 0,
        partial: numeric(row?.partial_count) ?? 0,
        failed: numeric(row?.failed_count) ?? 0,
        running: numeric(row?.running_count) ?? 0,
        skipped: numeric(row?.skipped_count) ?? 0,
        staleRunning: numeric(row?.stale_running_count) ?? 0,
      },
      averageDurationMs: numeric(row?.average_duration_ms) ?? 0,
      latestStartedAt: iso(row?.latest_started_at),
      runs,
    };
  });
  const observedModuleKeys = modules.filter((module) => module.coverage === "OBSERVED").map((module) => module.key);
  const totalRuns = numeric(stats?.total_runs) ?? 0;
  const successCount = numeric(stats?.success_count) ?? 0;

  return {
    ok: true,
    queriedAt: new Date().toISOString(),
    filters: { module: filter.moduleKey || null, status: filter.status || null, since: iso(filter.since), until: iso(filter.until), limit, failureLimit, includeSummary, staleAfterSeconds },
    totals: {
      runs: totalRuns,
      success: successCount,
      partial: numeric(stats?.partial_count) ?? 0,
      failed: numeric(stats?.failed_count) ?? 0,
      running: numeric(stats?.running_count) ?? 0,
      skipped: numeric(stats?.skipped_count) ?? 0,
      staleRunning: numeric(stats?.stale_running_count) ?? 0,
      successRate: totalRuns ? Number((successCount / totalRuns * 100).toFixed(2)) : 0,
      averageDurationMs: numeric(stats?.average_duration_ms) ?? 0,
      latestStartedAt: iso(stats?.latest_started_at),
    },
    coverage: {
      configuredModuleCount: modules.length,
      observedModuleCount: observedModuleKeys.length,
      noRunModuleKeys: modules.filter((module) => module.coverage === "NO_RUN").map((module) => module.key),
      notScheduledModuleKeys: modules.filter((module) => module.scheduler === "NOT_SCHEDULED").map((module) => module.key),
      optionalSchedulerModuleKeys: modules.filter((module) => module.scheduler === "OPTIONAL_CRON").map((module) => module.key),
      optionalButNeverObservedModuleKeys: modules.filter((module) => module.scheduler === "OPTIONAL_CRON" && module.coverage === "NO_RUN").map((module) => module.key),
      scheduledButNeverObservedModuleKeys: modules.filter((module) => module.scheduler === "OCI_CRON" && module.coverage === "NO_RUN").map((module) => module.key),
    },
    failureCategories: failureCategoryResult.rows.map((row) => ({ errorCode: row.error_code, count: numeric(row.count) ?? 0 })),
    skipReasons: skipReasonResult.rows.map((row) => ({ moduleKey: row.module_key, reason: row.reason, count: numeric(row.count) ?? 0 })),
    modules,
    recentRuns,
    failures: failureRows.rows.map((row) => normalizeAutomationDebugRun(row, includeSummary, staleAfterSeconds)),
  };
}
