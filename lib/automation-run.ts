import { finishAutomationRun, recordDebugRunItems, startAutomationRun, type AutomationRunDimensions } from "@/lib/automation-run-repository";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { describeError } from "@/lib/error-diagnostics";
import { readRequestTrace } from "@/lib/request-trace";
import { notifyAutomationCompletion } from "@/lib/automation-completion-discord";
import { getAutomationRunResultStatus } from "@/lib/automation-run-result-status";

const SUMMARY_MAX_DEPTH = 4;
const SUMMARY_MAX_STRING_LENGTH = 2_000;
const SUMMARY_MAX_ARRAY_SAMPLE = 3;

export function extractDebugItems(result: Record<string, unknown>) {
  if (Array.isArray(result.debugItems)) return result.debugItems;
  const candidates = ["results", "qualified", "items", "rows"].flatMap((key) => Array.isArray(result[key]) ? result[key] : []);
  const failures = Array.isArray(result.failureSamples) ? result.failureSamples : [];
  const failureItems = failures.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && ("code" in item || "ticker" in item))).map((item) => ({ ...item, status: item.status ?? "FAILED" }));
  return [...candidates, ...failureItems].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && ("code" in item || "ticker" in item))).map((item) => {
    const errorMessage = item.errorMessage ?? item.error ?? null;
    const rawCode = typeof errorMessage === "string" ? errorMessage.match(/^([A-Z][A-Z0-9_]+)/)?.[1] : null;
    const errorCode = item.errorCode ?? rawCode;
    return {
    market: item.market ?? null,
    code: item.code ?? item.ticker ?? null,
    timeframe: item.timeframe ?? result.timeframe ?? null,
    status: item.status ?? "SUCCESS",
    attemptCount: item.attemptCount ?? 0,
    startedAt: item.startedAt ?? null,
    completedAt: item.completedAt ?? null,
    durationMs: item.durationMs ?? null,
    errorCategory: item.errorCategory ?? (errorCode ? "PROCESSING" : null),
    errorCode: errorCode ?? null,
    errorMessage,
    metadata: compactAutomationSummary(item),
    };
  });
}

/** Keep automation_runs useful for diagnosis without persisting full scanner payloads. */
export function compactAutomationSummary(value: unknown, depth = 0, key = ""): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > SUMMARY_MAX_STRING_LENGTH ? `${value.slice(0, SUMMARY_MAX_STRING_LENGTH)}…` : value;
  if (depth >= SUMMARY_MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) {
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
    if (result && typeof result === "object") {
      try { await recordDebugRunItems(runId, extractDebugItems(result as Record<string, unknown>)); }
      catch (error) { console.warn(`[Automation] debug item persistence unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error); }
    }
    const summary: Record<string, unknown> = compactAutomationSummary(result && typeof result === "object" ? { ...(result as Record<string, unknown>) } : { result }) as Record<string, unknown>;
    summary.observability = { ...(summary.observability && typeof summary.observability === "object" ? summary.observability as Record<string, unknown> : {}), ...(trace || {}), durationMs: Date.now() - startedAt };
    // A worker can finish its loop while individual instruments failed. Persist
    // the same outcome that is sent to the completion notification so schedules
    // can distinguish a complete daily refresh from a partial/failed attempt.
    const count = (value: unknown) => {
      if (value == null) return { value: 0, valid: true };
      if (typeof value === "string" && value.trim() === "") return { value: 0, valid: false };
      const parsed = Number(value);
      const valid = Number.isSafeInteger(parsed) && parsed >= 0;
      return { value: valid ? parsed : 0, valid };
    };
    const failure = count(summary.failureCount);
    const instrument = count(summary.instrumentCount);
    const unattempted = count(summary.unattemptedCount);
    const failureCount = failure.value;
    const instrumentCount = instrument.value;
    const unattemptedCount = unattempted.value;
    const incomplete = summary.ok === false || failureCount > 0 || unattemptedCount > 0 || !failure.valid || !instrument.valid || !unattempted.valid;
    const runStatus = summary.skipped === true
      ? "SKIPPED"
      : !incomplete
        ? "SUCCESS"
        : instrumentCount > 0 && failureCount + unattemptedCount >= instrumentCount
          ? "FAILED"
          : "PARTIAL";
    try {
      summary.notifications = runStatus === "SKIPPED"
        ? { completion: { sent: false, skipped: true, reason: "already_running" } }
        : { completion: await notifyAutomationCompletion(moduleKey, runStatus, summary, runStatus === "FAILED" ? `${summary.failureCount}개 종목 처리 실패` : undefined) };
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
