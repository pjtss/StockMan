import { claimDueDiscordDeliveries, getMarketRssDeliveryArticleSnapshot, markDiscordDeliverySending, markDiscordDeliverySuperseded, persistDiscordDeliveryOutcome } from "@/lib/discord-delivery-queue";
import { loadFeatureDiscordDebugWebhook, loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { isRetryableDiscordError, parseMarketRssDeliveryArticleId, withDiscordWaitParameter } from "@/lib/discord-delivery-policy";
import { toTextWebhookPayload } from "@/lib/discord-text";
import { DISCORD_SUPPRESS_EMBEDS_FLAG, simplifyMarketRssDiscordMessage } from "@/lib/market-rss-discord-message";

async function webhookFor(channelKey: string) {
  const map: Record<string, { module: Parameters<typeof loadFeatureDiscordWebhook>[0]; env: string[] }> = {
    OBV: { module: "us-daily-indicators", env: ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "US_OBV_DISCORD_WEBHOOK_URL"] },
    NEWS_RADAR: { module: "us-news-radar", env: ["NEWS_RADAR_DISCORD_WEBHOOK_URL"] },
    BREAKING_NEWS: { module: "us-breaking-news-forwarder", env: ["KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL"] },
    MARKET_RSS: { module: "market-rss", env: ["MARKET_RSS_DISCORD_WEBHOOK_URL"] },
  };
  const target = map[channelKey];
  return target ? loadFeatureDiscordWebhook(target.module, target.env) : "";
}

export async function retryDiscordDeliveries(limit = 50) {
  const claim = await claimDueDiscordDeliveries(limit);
  const deliveries = claim.deliveries;
  const results = { claimed: deliveries.length, staleRecovered: claim.staleRecovered, uncertain: claim.uncertain, superseded: 0, sent: 0, failed: 0, permanentFailed: 0, persistenceFailed: 0, recovered: 0, repeatedFailure: 0, attempts: 0 };
  for (const delivery of deliveries) {
    const articleId = delivery.channelKey === "MARKET_RSS" ? parseMarketRssDeliveryArticleId(delivery.externalId) : null;
    const payload = delivery.payload as Record<string, unknown>;
    const storedSnapshot = payload._marketRssSnapshot;
    let expectedStatus: "PROCESSING" | "SENDING" = "PROCESSING";
    let expectedUpdatedAt = delivery.updatedAt;
    let sendError: unknown = null;
    let sendFailed = false;
    try {
      const webhook = await webhookFor(delivery.channelKey);
      if (!webhook) throw new Error(`webhook_missing:${delivery.channelKey}`);
      const payload: Record<string, unknown> = toTextWebhookPayload(delivery.payload as Record<string, unknown>);
      if (delivery.channelKey === "MARKET_RSS" && typeof payload.content === "string") {
        const articleId = parseMarketRssDeliveryArticleId(delivery.externalId);
        const hasStockTitanMarker = /(?:^|\n)출처: STOCKTITAN(?:\s|·|$)/m.test(payload.content);
        const article = articleId
          ? await getDb().select({ source: marketRssArticles.source }).from(marketRssArticles).where(eq(marketRssArticles.id, articleId)).limit(1)
          : [];
        const isStockTitan = hasStockTitanMarker || article[0]?.source === "STOCKTITAN";
        if (isStockTitan) {
          payload.content = payload.content.split("\n").filter((line) => !/^출처:\s*STOCKTITAN\b/.test(line) && !/^등락률:/.test(line) && !/^티커:/.test(line)).join("\n");
        } else {
          payload.content = simplifyMarketRssDiscordMessage(payload.content);
        }
        payload.flags = Number(payload.flags || 0) | DISCORD_SUPPRESS_EMBEDS_FLAG;
      }
      const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`discord_http_${response.status}`);
      await markDiscordDeliverySent(delivery.id);
      const articleId = delivery.channelKey === "MARKET_RSS" ? parseMarketRssDeliveryArticleId(delivery.externalId) : null;
      if (articleId) await markMarketRssDelivery(articleId, "SENT");
      results.sent += 1;
      results.attempts += delivery.attempts + 1;
      if (delivery.attempts > 0) results.recovered += 1;
    } catch {
      // Discord accepted the message; leave SENDING for uncertainty quarantine
      // rather than automatically resending a possible duplicate.
      results.persistenceFailed++;
    }
  }
  if (deliveries.length > 0 || results.uncertain > 0) {
    const debugWebhook = await loadFeatureDiscordDebugWebhook("discord-delivery-retry");
    if (debugWebhook) {
      const status = results.repeatedFailure > 0 || results.permanentFailed > 0 || results.persistenceFailed > 0 || results.uncertain > 0 ? "CRITICAL" : results.recovered > 0 ? "RECOVERED" : results.failed > 0 ? "WARNING" : "INFO";
      const content = [`🛠️ **Discord 재전송 통계 · ${status}**`, `대상: ${results.claimed}건`, `최종 성공: ${results.sent}건`, `재시도 후 복구: ${results.recovered}건`, `변경된 RSS payload 폐기: ${results.superseded}건`, `재시도 대기: ${results.failed - results.permanentFailed}건`, `영구 오류 종료: ${results.permanentFailed}건`, `미확정 격리: ${results.uncertain}건`, `stale 선전송 작업 복구: ${results.staleRecovered}건`, `DB 상태 기록 실패: ${results.persistenceFailed}건`, `5회 이상 반복 실패: ${results.repeatedFailure}건`, `총 시도 횟수: ${results.attempts}회`, `확인 시각: ${new Date().toISOString()}`].join("\n");
      try { await fetch(`${debugWebhook}${debugWebhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DEBUG", content, allowed_mentions: { parse: [] } }) }); } catch { /* debug delivery must never fail the retry job */ }
    }
  }
  return results;
}
