import { schedule } from "@netlify/functions";
import { ensureSchema, withAdvisoryLock } from "../../lib/db";
import { runUsTurnoverRatioAutomation } from "../../lib/us-turnover-ratio-automation";
import { finishAutomationRun, startAutomationRun } from "../../lib/automation-run-repository";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();
    const locked = await withAdvisoryLock("stockman:us-turnover-ratio", runUsTurnoverRatioAutomation);
    if (!locked.locked) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "already_running" }) };
    const runId = await startAutomationRun("us-turnover-ratio");
    const data = locked.value;
    await finishAutomationRun(runId, { status: data.skipped ? "skipped" : "completed", matchedCount: data.matched, sentCount: data.sent });
    console.log("[Cron] US turnover ratio completed:", data);
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (error) {
    console.error("[Cron] US turnover ratio failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error) }) };
  }
});
