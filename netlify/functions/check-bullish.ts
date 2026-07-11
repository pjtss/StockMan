import { schedule } from "@netlify/functions";
import { ensureSchema } from "../../lib/db";
import { sendPushAlerts } from "../../lib/push";
import { syncTopRisingStocks } from "../../lib/kis-us";
import type { AlertItem } from "../../lib/types";
import { loadAdminFeatureFlags } from "../../lib/admin-flags";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();
    const flags = await loadAdminFeatureFlags();

    // DART/SEC filings are handled by sync-filings. This job only handles KIS alerts.
    let risingSent = 0;
    try {
      if (!flags.us_scanners) {
        throw new Error("US scanners disabled by admin");
      }
      const newlyAdded = await syncTopRisingStocks();
      if (newlyAdded && newlyAdded.length > 0) {
        const risingAlerts: AlertItem[] = newlyAdded.map((s) => ({
          source: "TOP_RISING",
          externalId: `top-rising-${s.code}-${Date.now()}`,
          level: "상승률 TOP 10",
          company: s.company,
          title: s.changeRate,
          link: "/scanners/top-rising",
          publishedAt: new Date().toISOString(),
        }));
        await sendPushAlerts(risingAlerts);
        risingSent = risingAlerts.length;
      }
    } catch (kisErr) {
      console.error("Failed to sync and alert top rising stocks in scheduler:", kisErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        sent: 0,
        risingSent,
      }),
    };
  } catch (error) {
    console.error("check-bullish function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(error),
      }),
    };
  }
});
