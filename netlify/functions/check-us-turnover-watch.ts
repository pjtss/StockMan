import { schedule } from "@netlify/functions";
import { ensureSchema, withAdvisoryLock } from "../../lib/db";
import { runUsTurnoverWatchAutomation } from "../../lib/us-turnover-watch";
import { finishAutomationRun, startAutomationRun } from "../../lib/automation-run-repository";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();
    const locked = await withAdvisoryLock("stockman:us-turnover-watch", runUsTurnoverWatchAutomation);
    if (!locked.locked) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "already_running" }) };
    const runId = await startAutomationRun("us-turnover-watch");
    const data = locked.value;
    await finishAutomationRun(runId, { status: "completed", matchedCount: data.matched, sentCount: data.sent });
    console.log("[Cron] US turnover watch completed:", data);
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (error) {
    console.error("[Cron] US turnover watch failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error) }) };
  }
});
