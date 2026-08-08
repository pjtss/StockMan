import { desc, eq } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { automationRuns } from "@/lib/schema";
import type { FeatureModuleKey } from "@/lib/feature-modules";

const STALE_RUN_AFTER_SECONDS = 15 * 60;

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

export async function startAutomationRun(moduleKey: FeatureModuleKey) {
  const db = getDb();
  await reconcileStaleRuns();
  const rows = await db.insert(automationRuns).values({ moduleKey, status: "RUNNING", startedAt: new Date() }).returning({ id: automationRuns.id });
  return rows[0]?.id;
}

/** Persist schedule/feature no-ops so the debug API can distinguish disabled
 * modules from modules that were never wired to the scheduler. */
export async function recordSkippedAutomationRun(moduleKey: FeatureModuleKey, reason: string, details: Record<string, unknown> = {}) {
  try {
    const db = getDb();
    const now = new Date();
    await db.insert(automationRuns).values({
      moduleKey,
      status: "SKIPPED",
      startedAt: now,
      finishedAt: now,
      summary: { skipped: true, reason, ...details },
    });
  } catch (error) {
    console.warn(`[Automation] unable to record skipped run for ${moduleKey}:`, error instanceof Error ? error.message : error);
  }
}

export async function finishAutomationRun(id: number | undefined, status: "SUCCESS" | "PARTIAL" | "FAILED", summary: Record<string, unknown> = {}, errorMessage?: string) {
  if (!id) return;
  const db = getDb();
  await db.update(automationRuns).set({ status, finishedAt: new Date(), summary, errorMessage: errorMessage || null }).where(eq(automationRuns.id, id));
}

export async function loadRecentAutomationRuns(moduleKey: FeatureModuleKey, limit = 20) {
  const db = getDb();
  return db.select().from(automationRuns).where(eq(automationRuns.moduleKey, moduleKey)).orderBy(desc(automationRuns.startedAt)).limit(limit);
}

export async function loadLatestAutomationRun(moduleKey: FeatureModuleKey) {
  const rows = await loadRecentAutomationRuns(moduleKey, 1);
  return rows[0] || null;
}
