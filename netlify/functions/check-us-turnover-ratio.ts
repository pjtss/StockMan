import { schedule } from "@netlify/functions";
import { ensureSchema } from "../../lib/db";
import { runUsTurnoverRatioAutomation } from "../../lib/us-turnover-ratio-automation";
import { withAutomationLock } from "../../lib/automation-lock";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();
    const data = await withAutomationLock("us-turnover-ratio", runUsTurnoverRatioAutomation);
    console.log("[Cron] US turnover ratio completed:", data);
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (error) {
    console.error("[Cron] US turnover ratio failed:", error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(error) }) };
  }
});
