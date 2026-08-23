import { finishAutomationRun, startAutomationRun } from "@/lib/automation-run-repository";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { describeError } from "@/lib/error-diagnostics";
import { readRequestTrace } from "@/lib/request-trace";
import { notifyAutomationCompletion } from "@/lib/automation-completion-discord";

const SUMMARY_MAX_DEPTH = 4;
const SUMMARY_MAX_STRING_LENGTH = 2_000;
const SUMMARY_MAX_ARRAY_SAMPLE = 3;

/** Keep automation_runs useful for diagnosis without persisting full scanner payloads. */
export function compactAutomationSummary(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > SUMMARY_MAX_STRING_LENGTH ? `${value.slice(0, SUMMARY_MAX_STRING_LENGTH)}…` : value;
  if (depth >= SUMMARY_MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) {
    return { count: value.length, sample: value.slice(0, SUMMARY_MAX_ARRAY_SAMPLE).map((item) => compactAutomationSummary(item, depth + 1)) };
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactAutomationSummary(item, depth + 1)]));
  }
  return String(value);
}

export async function withAutomationRun<T>(moduleKey: FeatureModuleKey, task: () => Promise<T>) {
  // History is observability; it must never prevent an existing automation
  // from running when a test or degraded environment has no database.
  let runId: number | undefined;
  const startedAt = Date.now();
  const trace = await readRequestTrace();
  try { runId = await startAutomationRun(moduleKey); } catch (error) { console.warn(`[Automation] run history unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  const finishSafely = async (status: "SUCCESS" | "FAILED", summary: Record<string, unknown>, errorMessage?: string) => {
    try { await finishAutomationRun(runId, status, summary, errorMessage); }
    catch (error) { console.warn(`[Automation] unable to finalize run history for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  };
  try {
    const result = await task();
    const summary: Record<string, unknown> = compactAutomationSummary(result && typeof result === "object" ? { ...(result as Record<string, unknown>) } : { result }) as Record<string, unknown>;
    summary.observability = { ...(summary.observability && typeof summary.observability === "object" ? summary.observability as Record<string, unknown> : {}), ...(trace || {}), durationMs: Date.now() - startedAt };
    try {
      // A worker can finish its loop while individual instruments failed.
      // Keep the run technically completed for scheduling, but surface the
      // partial failure as a failure notification so the debug channel cannot
      // silently report a green run with missing candles.
      const failureCount = Number(summary.failureCount ?? 0);
      const instrumentCount = Number(summary.instrumentCount ?? 0);
      const notificationStatus = failureCount === 0
        ? "SUCCESS"
        : instrumentCount > 0 && failureCount >= instrumentCount
          ? "FAILED"
          : "PARTIAL";
      summary.notifications = { completion: await notifyAutomationCompletion(moduleKey, notificationStatus, summary, notificationStatus === "FAILED" ? `${summary.failureCount}개 종목 처리 실패` : undefined) };
    } catch (error) {
      summary.notifications = { completion: { sent: false, skipped: false, reason: "delivery_failed", error: error instanceof Error ? error.message : String(error) } };
      console.warn(`[Automation] completion notification failed for ${moduleKey}:`, error instanceof Error ? error.message : error);
    }
    await finishSafely("SUCCESS", summary);
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
