import { schedule } from "@netlify/functions";
import { runFilingSync } from "../../lib/filing-sync";

export const handler = schedule("* * * * *", async () => {
  try {
    const data = await runFilingSync();
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
