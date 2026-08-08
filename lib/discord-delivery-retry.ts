import { claimDueDiscordDeliveries, markDiscordDeliveryProcessing, markDiscordDeliveryRetry, markDiscordDeliverySent } from "@/lib/discord-delivery-queue";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

async function webhookFor(channelKey: string) {
  const map: Record<string, { module: Parameters<typeof loadFeatureDiscordWebhook>[0]; env: string[] }> = {
    US_TURNOVER_RATIO_NEW: { module: "us-turnover-ratio", env: ["US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL"] },
    US_TURNOVER_RATIO_INCREASE: { module: "us-turnover-ratio", env: ["US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL"] },
    OBV: { module: "us-daily-indicators", env: ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "US_OBV_DISCORD_WEBHOOK_URL"] },
    NEWS_RADAR: { module: "us-news-radar", env: ["NEWS_RADAR_DISCORD_WEBHOOK_URL"] },
    BREAKING_NEWS: { module: "us-breaking-news-forwarder", env: ["KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL"] },
  };
  const target = map[channelKey];
  return target ? loadFeatureDiscordWebhook(target.module, target.env) : "";
}

export async function retryDiscordDeliveries(limit = 50) {
  const deliveries = await claimDueDiscordDeliveries(limit);
  const results = { claimed: deliveries.length, sent: 0, failed: 0 };
  for (const delivery of deliveries) {
    await markDiscordDeliveryProcessing(delivery.id);
    const webhook = await webhookFor(delivery.channelKey);
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
