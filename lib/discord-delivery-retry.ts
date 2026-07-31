import { claimDueDiscordDeliveries, markDiscordDeliveryProcessing, markDiscordDeliveryRetry, markDiscordDeliverySent } from "@/lib/discord-delivery-queue";

function webhookFor(channelKey: string) {
  const map: Record<string, string | undefined> = {
    US_TURNOVER_RATIO_NEW: process.env.US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL,
    US_TURNOVER_RATIO_INCREASE: process.env.US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL,
    OBV: process.env.US_OBV_DISCORD_WEBHOOK_URL,
    NEWS_RADAR: process.env.NEWS_RADAR_DISCORD_WEBHOOK_URL,
  };
  return map[channelKey]?.trim() || "";
}

export async function retryDiscordDeliveries(limit = 50) {
  const deliveries = await claimDueDiscordDeliveries(limit);
  const results = { claimed: deliveries.length, sent: 0, failed: 0 };
  for (const delivery of deliveries) {
    await markDiscordDeliveryProcessing(delivery.id);
    const webhook = webhookFor(delivery.channelKey);
    try {
      if (!webhook) throw new Error(`webhook_missing:${delivery.channelKey}`);
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(delivery.payload) });
      if (!response.ok) throw new Error(`discord_http_${response.status}`);
      await markDiscordDeliverySent(delivery.id);
      results.sent += 1;
    } catch (error) {
      await markDiscordDeliveryRetry(delivery.id, error instanceof Error ? error.message : String(error), delivery.attempts + 1);
      results.failed += 1;
    }
  }
  return results;
}
