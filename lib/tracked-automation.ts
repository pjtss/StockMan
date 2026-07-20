import { finishAutomationRun, startAutomationRun } from "@/lib/automation-run-repository";

export async function runTrackedAutomation<T extends { matched?: number; sent?: number; skipped?: boolean }>(key: string, task: () => Promise<T>) {
  const runId = await startAutomationRun(key);
  try {
    const result = await task();
    await finishAutomationRun(runId, {
      status: result.skipped ? "skipped" : "completed",
      matchedCount: result.matched,
      sentCount: result.sent,
    });
    return result;
  } catch (error) {
    await finishAutomationRun(runId, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
