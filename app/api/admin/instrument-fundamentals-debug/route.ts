import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadAutomationDebugSnapshot, normalizeAutomationDebugRun } from "@/lib/automation-debug";
import { getAutomationRunResultStatus } from "@/lib/automation-run-result-status";

export const dynamic = "force-dynamic";

function intParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function addStatusDiagnostics<T extends { status: string; summary?: unknown }>(run: T) {
  const summary = run.summary && typeof run.summary === "object" && !Array.isArray(run.summary)
    ? run.summary as Record<string, unknown>
    : null;
  const hasStatusEvidence = Boolean(summary && (
    "failureCount" in summary || "partialFailureCount" in summary || "counterDataInvalid" in summary
  ));
  const derivedStatus = run.status !== "SKIPPED" && hasStatusEvidence
    ? getAutomationRunResultStatus(summary!).runStatus
    : null;
  return {
    ...run,
    effectiveStatus: derivedStatus ?? run.status,
    derivedStatus,
    statusMismatch: derivedStatus !== null && derivedStatus !== run.status,
  };
}

function summaryFailureSamples(summary: unknown) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  const value = summary as Record<string, unknown>;
  const failures = value.failures && typeof value.failures === "object" && !Array.isArray(value.failures)
    ? value.failures as Record<string, unknown>
    : null;
  const samples = Array.isArray(value.failureSamples)
    ? value.failureSamples
    : Array.isArray(failures?.sample) ? failures.sample : [];
  return samples.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      market: item.market ?? null,
      code: item.code ?? item.ticker ?? null,
      status: "FAILED",
      attemptCount: item.attemptCount ?? 0,
      durationMs: item.durationMs ?? null,
      errorCategory: item.errorCategory ?? null,
      errorCode: item.errorCode ?? null,
      errorMessage: item.errorMessage ?? item.error ?? null,
      metadata: item,
    }));
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const limit = intParam(params.get("limit"), 20, 1, 50);
  const staleAfterHours = intParam(params.get("staleAfterHours"), 72, 1, 720);
  if (limit === null || staleAfterHours === null) {
    return NextResponse.json({ ok: false, error: "INVALID_DEBUG_QUERY", allowed: { limit: [1, 50], staleAfterHours: [1, 720] } }, { status: 400 });
  }

  try {
    const [settings, automation, latestExecutionResult, coverageResult] = await Promise.all([
      loadFeatureModuleSettings("instrument-fundamentals"),
      loadAutomationDebugSnapshot({ moduleKey: "instrument-fundamentals", limit, failureLimit: limit, includeSummary: true, staleAfterSeconds: 2 * 60 * 60 }),
      getPool().query(
        `SELECT id, module_key, status, started_at, finished_at,
                CASE WHEN finished_at IS NULL THEN ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::bigint
                     ELSE ROUND(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::bigint
                END AS duration_ms,
                summary, error_message
           FROM automation_runs
          WHERE module_key = 'instrument-fundamentals'
            AND status <> 'SKIPPED'
          ORDER BY started_at DESC
          LIMIT 1`,
      ),
      getPool().query(
        `WITH active_universe AS (
           SELECT market, code FROM kr_common_stock_universe WHERE enabled = true
           UNION ALL
           SELECT market, code FROM us_common_stock_universe WHERE enabled = true
         ), coverage AS (
           SELECT u.market, s.market_cap, s.currency, s.fetched_at
             FROM active_universe u
             LEFT JOIN instrument_fundamental_snapshots s ON s.market = u.market AND s.code = u.code
         )
         SELECT market,
                COUNT(*)::int AS active_instruments,
                COUNT(*) FILTER (WHERE fetched_at IS NOT NULL)::int AS snapshot_count,
                COUNT(*) FILTER (WHERE fetched_at IS NULL)::int AS missing_snapshot_count,
                COUNT(*) FILTER (WHERE market_cap IS NULL OR market_cap <= 0)::int AS invalid_market_cap_count,
                COUNT(*) FILTER (WHERE fetched_at >= NOW() - ($1::int * INTERVAL '1 hour'))::int AS fresh_snapshot_count,
                MAX(fetched_at) AS latest_fetched_at,
                COUNT(*) FILTER (WHERE currency IS NULL OR currency NOT IN ('KRW', 'USD'))::int AS unsupported_currency_count
           FROM coverage
          GROUP BY market
          ORDER BY market`,
        [staleAfterHours],
      ),
    ]);

    const now = new Date();
    const withinSchedule = isWithinSchedule(settings, now);
    const runs = automation.recentRuns.map(addStatusDiagnostics);
    const latestExecutionRow = latestExecutionResult.rows[0];
    let latestExecuted: (ReturnType<typeof normalizeAutomationDebugRun> & {
      itemsSource?: string;
      itemsWarning?: string | null;
      effectiveStatus?: string;
      derivedStatus?: string | null;
      statusMismatch?: boolean;
    }) | null = latestExecutionRow
      ? normalizeAutomationDebugRun(latestExecutionRow, true, 2 * 60 * 60)
      : null;
    if (latestExecuted) {
      try {
        const itemResult = await getPool().query(
          `SELECT run_id, market, code, timeframe, status, attempt_count, started_at, completed_at, duration_ms, error_category, error_code, error_message, metadata
             FROM debug_run_items
            WHERE run_id = $1
            ORDER BY completed_at DESC NULLS LAST`,
          [latestExecuted.id],
        );
        latestExecuted.items = itemResult.rows.length ? itemResult.rows : summaryFailureSamples(latestExecuted.summary);
        latestExecuted.itemsSource = itemResult.rows.length ? "debug_run_items" : "summary_failure_samples";
        latestExecuted.itemsWarning = itemResult.rows.length ? null : "NO_DEBUG_ITEMS_FOR_RUN";
      } catch (error) {
        console.warn("[API /admin/instrument-fundamentals-debug] latest run item details unavailable:", error instanceof Error ? error.message : "unknown error");
        latestExecuted.items = summaryFailureSamples(latestExecuted.summary);
        latestExecuted.itemsSource = latestExecuted.items.length ? "summary_failure_samples" : "unavailable";
        latestExecuted.itemsWarning = "DEBUG_RUN_ITEMS_TABLE_UNAVAILABLE";
      }
      latestExecuted = addStatusDiagnostics(latestExecuted);
    }
    const elapsedSeconds = latestExecuted ? Math.max(0, Math.floor((now.getTime() - new Date(latestExecuted.startedAt).getTime()) / 1000)) : null;
    const intervalSeconds = 86_400;
    const overdueSeconds = elapsedSeconds === null || latestExecuted?.status === "RUNNING"
      ? 0
      : Math.max(0, elapsedSeconds - intervalSeconds);
    const effectiveFailures = new Map<number, (typeof runs)[number] | NonNullable<typeof latestExecuted>>();
    for (const run of [...automation.failures, ...runs.filter((item) => item.effectiveStatus === "PARTIAL" || item.effectiveStatus === "FAILED")]) {
      const diagnosed = addStatusDiagnostics(run);
      effectiveFailures.set(diagnosed.id, diagnosed);
    }
    if (latestExecuted && (latestExecuted.effectiveStatus === "PARTIAL" || latestExecuted.effectiveStatus === "FAILED")) {
      effectiveFailures.set(latestExecuted.id, latestExecuted);
    }
    return NextResponse.json({
      ok: true,
      mode: "INSTRUMENT_FUNDAMENTALS_DEBUG",
      checkedAt: now.toISOString(),
      responseTimeMs: Date.now() - startedAt,
      timezone: "Asia/Seoul",
      feature: {
        key: "instrument-fundamentals",
        enabled: settings.enabled,
        startTime: settings.startTime,
        endTime: settings.endTime,
        activeDays: settings.activeDays,
        scheduleMode: settings.scheduleMode,
        intervalSeconds,
        intervalHours: intervalSeconds / 3600,
        updatedAt: settings.updatedAt ?? null,
        withinSchedule,
      },
      execution: {
        latestRun: latestExecuted,
        latestObservedRun: runs[0] ?? null,
        elapsedSeconds,
        intervalStatus: latestExecuted === null ? "NO_RUN" : latestExecuted.status === "RUNNING" ? "RUNNING" : overdueSeconds > 0 ? "OVERDUE" : "WITHIN_INTERVAL",
        overdueSeconds,
        nextIntervalEligibleAt: elapsedSeconds === null ? null : new Date(now.getTime() + Math.max(0, intervalSeconds - elapsedSeconds) * 1000).toISOString(),
        totals: automation.totals,
        skipReasons: automation.skipReasons,
        failureCategories: automation.failureCategories,
        recentRuns: runs,
        failures: [...effectiveFailures.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit),
      },
      snapshotCoverage: {
        staleAfterHours,
        byMarket: coverageResult.rows.map((row) => ({
          market: row.market,
          activeInstruments: Number(row.active_instruments),
          snapshotCount: Number(row.snapshot_count),
          missingSnapshotCount: Number(row.missing_snapshot_count),
          invalidMarketCapCount: Number(row.invalid_market_cap_count),
          freshSnapshotCount: Number(row.fresh_snapshot_count),
          staleOrMissingCount: Number(row.active_instruments) - Number(row.fresh_snapshot_count),
          latestFetchedAt: row.latest_fetched_at ? new Date(row.latest_fetched_at).toISOString() : null,
          unsupportedCurrencyCount: Number(row.unsupported_currency_count),
        })),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /admin/instrument-fundamentals-debug] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "INSTRUMENT_FUNDAMENTALS_DEBUG_UNAVAILABLE", responseTimeMs: Date.now() - startedAt }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
