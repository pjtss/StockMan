import { schedule } from "@netlify/functions";
import { ensureSchema } from "../../lib/db";
import { markAlertsDelivered, syncDartAlerts, syncSecAlerts } from "../../lib/alerts";
import { sendPushAlerts } from "../../lib/push";

export const handler = schedule("*/1 * * * *", async () => {
  await ensureSchema();

  const [dartPayload, secPayload] = await Promise.all([syncDartAlerts(), syncSecAlerts()]);
  const alerts = [...(dartPayload.newAlerts ?? []), ...(secPayload.newAlerts ?? [])];

  await sendPushAlerts(alerts);
  // await markAlertsDelivered(alerts);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: alerts.length,
    }),
  };
});

