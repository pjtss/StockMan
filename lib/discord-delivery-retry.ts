import { eq, sql } from "drizzle-orm";
import { claimDueDiscordDeliveries, markDiscordDeliveryRetry, markDiscordDeliverySent } from "@/lib/discord-delivery-queue";
import { loadFeatureDiscordDebugWebhook, loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";
import { parseMarketRssDeliveryArticleId } from "@/lib/discord-delivery-policy";

async function webhookFor(channelKey: string) {
  const map: Record<string, { module: Parameters<typeof loadFeatureDiscordWebhook>[0]; env: string[] }> = {
    US_TURNOVER_RATIO_NEW: { module: "us-turnover-ratio", env: ["US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL"] },
    US_TURNOVER_RATIO_INCREASE: { module: "us-turnover-ratio", env: ["US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL"] },
    OBV: { module: "us-daily-indicators", env: ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "US_OBV_DISCORD_WEBHOOK_URL"] },
    NEWS_RADAR: { module: "us-news-radar", env: ["NEWS_RADAR_DISCORD_WEBHOOK_URL"] },
    BREAKING_NEWS: { module: "us-breaking-news-forwarder", env: ["KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL"] },
    MARKET_RSS: { module: "market-rss", env: ["MARKET_RSS_DISCORD_WEBHOOK_URL"] },
  };
  const target = map[channelKey];
  return target ? loadFeatureDiscordWebhook(target.module, target.env) : "";
}

async function markMarketRssDelivery(articleId: number, status: "SENT" | "FAILED", error?: string) {
  const db = getDb();
  await db.update(marketRssArticles).set({
    notificationStatus: status,
    notificationAttempts: sql`${marketRssArticles.notificationAttempts} + 1`,
    ...(status === "SENT" ? { notifiedAt: new Date(), lastError: null } : { lastError: error || "Discord delivery failed" }),
    updatedAt: new Date(),
  }).where(eq(marketRssArticles.id, articleId));
}

export async function retryDiscordDeliveries(limit = 50) {
  const deliveries = await claimDueDiscordDeliveries(limit);
  const results = { claimed: deliveries.length, sent: 0, failed: 0, recovered: 0, repeatedFailure: 0, attempts: 0 };
  for (const delivery of deliveries) {
    const webhook = await webhookFor(delivery.channelKey);
    try {
      if (!webhook) throw new Error(`webhook_missing:${delivery.channelKey}`);
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(delivery.payload) });
      if (!response.ok) throw new Error(`discord_http_${response.status}`);
      await markDiscordDeliverySent(delivery.id);
      const articleId = delivery.channelKey === "MARKET_RSS" ? parseMarketRssDeliveryArticleId(delivery.externalId) : null;
      if (articleId) await markMarketRssDelivery(articleId, "SENT");
      results.sent += 1;
      results.attempts += delivery.attempts + 1;
      if (delivery.attempts > 0) results.recovered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markDiscordDeliveryRetry(delivery.id, message, delivery.attempts + 1);
      const articleId = delivery.channelKey === "MARKET_RSS" ? parseMarketRssDeliveryArticleId(delivery.externalId) : null;
      if (articleId) await markMarketRssDelivery(articleId, "FAILED", message);
      results.failed += 1;
      results.attempts += delivery.attempts + 1;
      if (delivery.attempts + 1 >= 5) results.repeatedFailure += 1;
    }
  }
  if (deliveries.length > 0) {
    const debugWebhook = await loadFeatureDiscordDebugWebhook("discord-delivery-retry");
    if (debugWebhook) {
      const status = results.repeatedFailure > 0 ? "CRITICAL" : results.recovered > 0 ? "RECOVERED" : results.failed > 0 ? "WARNING" : "INFO";
      const content = [`🛠️ **Discord 재전송 통계 · ${status}**`, `대상: ${results.claimed}건`, `최종 성공: ${results.sent}건`, `재시도 후 복구: ${results.recovered}건`, `실패 유지: ${results.failed}건`, `5회 이상 반복 실패: ${results.repeatedFailure}건`, `총 시도 횟수: ${results.attempts}회`, `확인 시각: ${new Date().toISOString()}`].join("\n");
      try { await fetch(`${debugWebhook}${debugWebhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DEBUG", content, allowed_mentions: { parse: [] } }) }); } catch { /* debug delivery must never fail the retry job */ }
    }
  }
  return results;
}
