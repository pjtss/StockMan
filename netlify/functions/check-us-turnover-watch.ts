import { schedule } from "@netlify/functions";
import { ensureSchema, withAdvisoryLock } from "../../lib/db";
import { runUsTurnoverWatchAutomation } from "../../lib/us-turnover-watch";
import { runTrackedAutomation } from "../../lib/tracked-automation";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();
    const locked = await withAdvisoryLock("stockman:us-turnover-watch", runUsTurnoverWatchAutomation);
    if (!locked.locked) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "already_running" }) };
    const data = await runTrackedAutomation("us-turnover-watch", async () => locked.value);
    console.log("[Cron] US turnover watch completed:", data);
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (error) {
    console.error("[Cron] US turnover watch failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error) }) };
  }
});
