import type { UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { formatKoreanCompact } from "@/lib/korean-number-format";
import { getUsDailyIndicatorsWebhook } from "@/lib/discord-us-daily-indicators";
import { toTextWebhookPayload } from "@/lib/discord-text";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

export async function sendUsDailyBreakoutToDiscord(items: UsFiveDayHighBreakoutResult[]) {
  const webhook = await loadFeatureDiscordWebhook("us-daily-indicators", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "US_DAILY_BREAKOUT_DISCORD_WEBHOOK_URL"]);
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  if (!items.length) return { ok: true, sent: 0 };
  const blocks = items.map((item) => [
    `**${item.market} ${item.code}**`,
    `당일 시가: ${item.currentPrice}`, `직전 5거래일 최고가: ${item.previousFiveDayHigh}`,
    `등락률: ${item.rate ?? "확인 불가"}%`,
    `거래량: ${formatKoreanCompact(item.volume, "주")}`,
    `시가총액: ${formatKoreanCompact(item.marketCap, " 달러")}`,
    `당일 거래대금: ${formatKoreanCompact(item.tradingValue, " 달러")}`,
    `시총 대비 거래대금: ${item.turnoverRatio == null ? "확인 불가" : `${item.turnoverRatio.toFixed(2)}%`}`,
    `유통주: ${formatKoreanCompact(item.freeFloatShares, "주")} · 유통비율: ${item.freeFloatPercent == null ? "확인 불가" : `${item.freeFloatPercent}%`}`,
    `기준일: ${item.previousFiveTradingDays.join(", ")}`,
  ].join("\n"));
  const description = blocks.join("\n\n").slice(0, 4_050);
  const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toTextWebhookPayload({ username: "STOCKMAN DAILY BREAKOUT", allowed_mentions: { parse: [] }, embeds: [{ title: "🚨 해외주식 일봉 5거래일 고가 돌파 알림", description, color: 0xdc2626, footer: { text: "STOCKMAN · 당일 시가 기준 · 카드 1개 통합" }, timestamp: new Date().toISOString() }] })) });
  const responses = [{ ok: response.ok, status: response.status }];
  const successful = responses.filter((response) => response.ok).length;
  return { ok: successful === responses.length, status: responses.find((response) => !response.ok)?.status ?? 200, sent: successful === responses.length ? items.length : 0, messagesSent: successful };
}
