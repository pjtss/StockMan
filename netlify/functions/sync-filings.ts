import { schedule } from "@netlify/functions";
import { runFilingSync } from "../../lib/filing-sync";
import { ensureSchema, withAdvisoryLock } from "../../lib/db";
import { runTrackedAutomation } from "../../lib/tracked-automation";

export const handler = schedule("* * * * *", async () => {
  try {
    await ensureSchema();
    const locked = await withAdvisoryLock("stockman:filing-sync", async () => runTrackedAutomation("filing-sync", async () => {
      const result = await runFilingSync();
      return { matched: 0, sent: 0, result };
    }));
    if (!locked.locked) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "already_running" }) };
    const data = locked.value.result;
    console.log("[Cron] Sync filings successful:", data);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Sync filings triggered successfully",
        data,
      }),
    };
  } catch (err) {
    console.error("[Cron] Error triggering sync filings:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(err),
      }),
    };
  }
});
