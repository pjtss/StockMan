import { finishAutomationRun, startAutomationRun, type AutomationRunDimensions } from "@/lib/automation-run-repository";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { describeError } from "@/lib/error-diagnostics";
import { readRequestTrace } from "@/lib/request-trace";
import { notifyAutomationCompletion } from "@/lib/automation-completion-discord";
import { getAutomationRunResultStatus } from "@/lib/automation-run-result-status";
import { withAutomationLock } from "@/lib/automation-lock";

const SUMMARY_MAX_DEPTH = 4;
const SUMMARY_MAX_STRING_LENGTH = 2_000;
const SUMMARY_MAX_ARRAY_SAMPLE = 3;

/** Keep automation_runs useful for diagnosis without persisting full scanner payloads. */
export function compactAutomationSummary(value: unknown, depth = 0, key = ""): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncateSummaryString(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (value instanceof Error) return { name: truncateSummaryString(value.name), message: truncateSummaryString(value.message) };
  if (depth >= SUMMARY_MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) {
    // RSS has a small, fixed source set. Preserve every source outcome so the
    // disclosure coverage reader can distinguish sources beyond the sample.
    if (key === "sourceResults") return value.map((item) => compactAutomationSummary(item, depth + 1));
    // Per-market totals are a small bounded set and are required to diagnose
    // partial fundamentals refreshes; do not collapse them to a sample.
    if (key === "markets") return value.map((item) => compactAutomationSummary(item, depth + 1));
    return { count: value.length, sample: value.slice(0, SUMMARY_MAX_ARRAY_SAMPLE).map((item) => compactAutomationSummary(item, depth + 1)) };
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, item]) => [childKey, compactAutomationSummary(item, depth + 1, childKey)]));
  }
  return String(value);
}

export async function withAutomationRun<T>(moduleKey: FeatureModuleKey, task: () => Promise<T>, dimensions: AutomationRunDimensions = {}) {
  // History is observability; it must never prevent an existing automation
  // from running when a test or degraded environment has no database.
  let runId: number | undefined;
  const startedAt = Date.now();
  const trace = await readRequestTrace();
  try { runId = await startAutomationRun(moduleKey, dimensions); } catch (error) { console.warn(`[Automation] run history unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  const finishSafely = async (status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED", summary: Record<string, unknown>, errorMessage?: string) => {
    try { await finishAutomationRun(runId, status, summary, errorMessage); }
    catch (error) { console.warn(`[Automation] unable to finalize run history for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  };
  try {
    const result = await task();
    const summary: Record<string, unknown> = compactAutomationSummary(result && typeof result === "object" ? { ...(result as Record<string, unknown>) } : { result }) as Record<string, unknown>;
    summary.observability = { ...(summary.observability && typeof summary.observability === "object" ? summary.observability as Record<string, unknown> : {}), ...(trace || {}), durationMs: Date.now() - startedAt };
    // A worker can finish its loop while individual instruments failed. Persist
    // the same outcome that is sent to the completion notification so schedules
    // can distinguish a complete daily refresh from a partial/failed attempt.
    const runStatus = summary.skipped === true ? "SKIPPED" : getAutomationRunResultStatus(summary).runStatus;
    const failureCount = typeof summary.failureCount === "number" && Number.isFinite(summary.failureCount) && summary.failureCount > 0
      ? summary.failureCount
      : null;
    try {
      summary.notifications = runStatus === "SKIPPED"
        ? { completion: { sent: false, skipped: true, reason: "already_running" } }
        : { completion: await notifyAutomationCompletion(moduleKey, runStatus, summary, runStatus === "FAILED" && failureCount != null ? `${failureCount}개 종목 처리 실패` : undefined) };
    } catch (error) {
      summary.notifications = { completion: { sent: false, skipped: false, reason: "delivery_failed", error: error instanceof Error ? error.message : String(error) } };
      console.warn(`[Automation] completion notification failed for ${moduleKey}:`, error instanceof Error ? error.message : error);
    }
    await finishSafely(runStatus, summary);
    return result;
  } catch (error) {
    const diagnostics = describeError(error);
    const summary: Record<string, unknown> = { diagnostics, observability: { ...(trace || {}), durationMs: Date.now() - startedAt } };
    try {
      summary.notifications = { completion: await notifyAutomationCompletion(moduleKey, "FAILED", summary, diagnostics.message) };
    } catch (notificationError) {
      summary.notifications = { completion: { sent: false, skipped: false, reason: "delivery_failed", error: notificationError instanceof Error ? notificationError.message : String(notificationError) } };
      console.warn(`[Automation] failure notification failed for ${moduleKey}:`, notificationError instanceof Error ? notificationError.message : notificationError);
    }
    await finishSafely("FAILED", summary, diagnostics.message);
    throw error;
  }
}

/** Serialize same-module executions across processes before creating a run row. */
export async function withExclusiveAutomationRun<T>(moduleKey: FeatureModuleKey, task: () => Promise<T>, dimensions: AutomationRunDimensions = {}) {
  const lockKey = `automation-run:${moduleKey}`;
  const locked = await withAutomationLock(lockKey, async () => ({
    result: await withAutomationRun(moduleKey, task, dimensions),
  }));
  if (locked === null) {
    await recordSkippedAutomationRun(moduleKey, "already_running", { lockKey });
    return { acquired: false as const };
  }
  return { acquired: true as const, result: locked.result };
}
