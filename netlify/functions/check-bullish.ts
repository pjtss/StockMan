import { schedule } from "@netlify/functions";
import { ensureSchema } from "../../lib/db";
import { syncDartAlerts } from "../../lib/alerts";
import { sendPushAlerts } from "../../lib/push";
import { sendTelegramAlerts } from "../../lib/telegram";
import { syncTopRisingStocks } from "../../lib/kis";
import type { AlertItem } from "../../lib/types";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    await ensureSchema();

    // 1. DART 공시 동기화 및 알림 발송
    const dartPayload = await syncDartAlerts();
    const alerts = dartPayload.newAlerts ?? [];

    await Promise.all([
      sendPushAlerts(alerts),
      sendTelegramAlerts(alerts)
    ]);

    // 2. KIS 상승률 TOP 10 동기화 및 알림 발송
    let risingSent = 0;
    try {
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
        sent: alerts.length,
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
