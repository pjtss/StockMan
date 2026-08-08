import { finishAutomationRun, startAutomationRun } from "@/lib/automation-run-repository";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { describeError } from "@/lib/error-diagnostics";
import { readRequestTrace } from "@/lib/request-trace";

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
    const summary: Record<string, unknown> = result && typeof result === "object" ? { ...(result as Record<string, unknown>) } : { result };
    summary.observability = { ...(summary.observability && typeof summary.observability === "object" ? summary.observability as Record<string, unknown> : {}), ...(trace || {}), durationMs: Date.now() - startedAt };
    await finishSafely("SUCCESS", summary);
    return result;
  } catch (error) {
    const diagnostics = describeError(error);
    await finishSafely("FAILED", { diagnostics, observability: { ...(trace || {}), durationMs: Date.now() - startedAt } }, diagnostics.message);
    throw error;
  }
}
