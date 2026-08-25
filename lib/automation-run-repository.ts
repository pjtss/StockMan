import { desc, eq } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { automationRuns } from "@/lib/schema";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { readRequestTrace } from "@/lib/request-trace";

// Daily candle jobs legitimately run longer than 15 minutes on the full
// universe. Keep stale recovery above the cron request ceiling so an active
// worker is never falsely finalized while it is still processing.
const STALE_RUN_AFTER_SECONDS = 2 * 60 * 60;
const SKIP_OBSERVATION_WINDOW_SECONDS = 5 * 60;

export type AutomationRunDimensions = {
  jobType?: string;
  market?: "KR" | "US" | string;
  timeframe?: "D" | "W" | "M" | string;
  triggerType?: "AUTOMATION" | "MANUAL" | "RETRY" | string;
  retryCount?: number;
};

function inferRunDimensions(moduleKey: string, dimensions: AutomationRunDimensions) {
  const market = dimensions.market ?? (moduleKey.startsWith("kr-") ? "KR" : moduleKey.startsWith("us-") ? "US" : undefined);
  const timeframe = dimensions.timeframe ?? (moduleKey.includes("minute") ? "1m" : moduleKey.includes("weekly") ? "W" : moduleKey.includes("monthly") ? "M" : moduleKey.includes("daily") || moduleKey.includes("bollinger") || moduleKey.includes("golden-cross") ? "D" : undefined);
  return { jobType: dimensions.jobType ?? moduleKey, market, timeframe, triggerType: dimensions.triggerType ?? "AUTOMATION", retryCount: Math.max(0, Math.floor(dimensions.retryCount ?? 0)) };
}

/** Mark abandoned workers before creating a new run. */
async function reconcileStaleRuns() {
  try {
    await getPool().query(
      `UPDATE automation_runs
          SET status = 'FAILED',
              finished_at = COALESCE(finished_at, NOW()),
              summary = jsonb_build_object(
                'diagnostics', jsonb_build_object(
                  'errorCode', 'AUTOMATION_RUN_STALE',
                  'message', 'The worker stopped before finalizing the run'
                )
              ),
              error_message = 'The worker stopped before finalizing the run'
        WHERE status = 'RUNNING'
          AND started_at < NOW() - ($1 * INTERVAL '1 second')`,
      [STALE_RUN_AFTER_SECONDS],
    );
  } catch (error) {
    // Observability recovery must never prevent the actual feature from
    // running (for example while the database is temporarily unavailable).
    console.warn("[Automation] stale-run reconciliation failed:", error instanceof Error ? error.message : error);
  }
}

export async function startAutomationRun(moduleKey: FeatureModuleKey, dimensions: AutomationRunDimensions = {}) {
  const db = getDb();
  await reconcileStaleRuns();
  const normalized = inferRunDimensions(moduleKey, dimensions);
  const rows = await db.insert(automationRuns).values({
    moduleKey,
    status: "RUNNING",
    startedAt: new Date(),
    jobType: normalized.jobType,
    market: normalized.market ?? null,
    timeframe: normalized.timeframe ?? null,
    triggerType: normalized.triggerType,
    retryCount: normalized.retryCount,
  }).returning({ id: automationRuns.id });
  return rows[0]?.id;
}

/** Persist schedule/feature no-ops so the debug API can distinguish disabled
 * modules from modules that were never wired to the scheduler. */
export async function recordSkippedAutomationRun(moduleKey: FeatureModuleKey, reason: string, details: Record<string, unknown> = {}) {
  try {
    const trace = await readRequestTrace();
    const summary = JSON.stringify({ skipped: true, reason, observationWindowSeconds: SKIP_OBSERVATION_WINDOW_SECONDS, ...details, ...(trace ? { observability: trace } : {}) });
    await getPool().query(
      `INSERT INTO automation_runs (module_key, status, started_at, finished_at, summary)
       SELECT $1, 'SKIPPED', NOW(), NOW(), $3::jsonb
        WHERE NOT EXISTS (
          SELECT 1
            FROM automation_runs
           WHERE module_key = $1
             AND status = 'SKIPPED'
             AND summary->>'reason' = $2
             AND started_at >= NOW() - ($4 * INTERVAL '1 second')
        )`,
      [moduleKey, reason, summary, SKIP_OBSERVATION_WINDOW_SECONDS],
    );
  } catch (error) {
    console.warn(`[Automation] unable to record skipped run for ${moduleKey}:`, error instanceof Error ? error.message : error);
  }
}

export async function finishAutomationRun(id: number | undefined, status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED", summary: Record<string, unknown> = {}, errorMessage?: string) {
  if (!id) return;
  const db = getDb();
  const finishedAt = new Date();
  const started = await db.select({ startedAt: automationRuns.startedAt }).from(automationRuns).where(eq(automationRuns.id, id)).limit(1);
  const durationMs = started[0]?.startedAt ? Math.max(0, finishedAt.getTime() - started[0].startedAt.getTime()) : null;
  await db.update(automationRuns).set({ status, finishedAt, durationMs, summary, errorMessage: errorMessage || null }).where(eq(automationRuns.id, id));
}

export async function loadRecentAutomationRuns(moduleKey: FeatureModuleKey, limit = 20) {
  const db = getDb();
  return db.select().from(automationRuns).where(eq(automationRuns.moduleKey, moduleKey)).orderBy(desc(automationRuns.startedAt)).limit(limit);
}

export async function loadLatestAutomationRun(moduleKey: FeatureModuleKey) {
  const rows = await loadRecentAutomationRuns(moduleKey, 1);
  return rows[0] || null;
}

/**
 * Return the latest actual execution while ignoring schedule observations.
 * A scheduler may record many SKIPPED rows between executions; those rows
 * must not reset an interval-based feature's cooldown.
 */
export async function loadLatestExecutedAutomationRun(moduleKey: FeatureModuleKey) {
  const rows = await getPool().query<{
    id: number;
    status: string;
    started_at: string;
    finished_at: string | null;
  }>(
    `SELECT id, status, started_at, finished_at
       FROM automation_runs
      WHERE module_key = $1
        AND status <> 'SKIPPED'
      ORDER BY started_at DESC
      LIMIT 1`,
    [moduleKey],
  );
  return rows.rows[0] || null;
}

/** Return an active worker so expensive scans cannot overlap. */
export async function loadRunningAutomationRun(moduleKey: FeatureModuleKey) {
  const rows = await getPool().query<{
    id: number;
    started_at: string;
  }>(
    `SELECT id, started_at
       FROM automation_runs
      WHERE module_key = $1
        AND status = 'RUNNING'
        AND started_at >= NOW() - ($2 * INTERVAL '1 second')
      ORDER BY started_at DESC
      LIMIT 1`,
    [moduleKey, STALE_RUN_AFTER_SECONDS],
  );
  return rows.rows[0] || null;
}
