import { schedule } from "@netlify/functions";
import { ensureSchema } from "../../lib/db";
import { markAlertsDelivered, syncDartAlerts, syncSecAlerts } from "../../lib/alerts";
import { sendPushAlerts } from "../../lib/push";
import { sendTelegramAlerts } from "../../lib/telegram";

export const handler = schedule("*/1 * * * *", async () => {
  await ensureSchema();

  const [dartPayload, secPayload] = await Promise.all([syncDartAlerts(), syncSecAlerts()]);
  const alerts = [...(dartPayload.newAlerts ?? []), ...(secPayload.newAlerts ?? [])];

  await Promise.all([
    sendPushAlerts(alerts),
    sendTelegramAlerts(alerts)
  ]);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: alerts.length,
    }),
  };
});

