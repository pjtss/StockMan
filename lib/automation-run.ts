import { finishAutomationRun, startAutomationRun } from "@/lib/automation-run-repository";
import type { FeatureModuleKey } from "@/lib/feature-modules";

export async function withAutomationRun<T>(moduleKey: FeatureModuleKey, task: () => Promise<T>) {
  // History is observability; it must never prevent an existing automation
  // from running when a test or degraded environment has no database.
  let runId: number | undefined;
  try { runId = await startAutomationRun(moduleKey); } catch (error) { console.warn(`[Automation] run history unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  const finishSafely = async (status: "SUCCESS" | "FAILED", summary: Record<string, unknown>, errorMessage?: string) => {
    try { await finishAutomationRun(runId, status, summary, errorMessage); }
    catch (error) { console.warn(`[Automation] unable to finalize run history for ${moduleKey}:`, error instanceof Error ? error.message : error); }
  };
  try {
    const result = await task();
    await finishSafely("SUCCESS", result && typeof result === "object" ? result as Record<string, unknown> : { result });
    return result;
  } catch (error) {
    await finishSafely("FAILED", {}, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
