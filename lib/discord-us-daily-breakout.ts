import type { UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";
import { formatKoreanCompact } from "@/lib/korean-number-format";
import { getUsDailyIndicatorsWebhook } from "@/lib/discord-us-daily-indicators";

export async function sendUsDailyBreakoutToDiscord(items: UsFiveDayHighBreakoutResult[]) {
  const webhook = getUsDailyIndicatorsWebhook() || process.env.US_DAILY_BREAKOUT_DISCORD_WEBHOOK_URL?.trim() || "";
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  if (!items.length) return { ok: true, sent: 0 };
  const content = items.map((item) => [
    `🚨 **${item.market} ${item.code} 5일 고가 돌파**`,
    `당일 시가: ${item.currentPrice}`, `직전 5거래일 최고가: ${item.previousFiveDayHigh}`,
    `등락률: ${item.rate ?? "확인 불가"}%`,
    `거래량: ${formatKoreanCompact(item.volume, "주")}`,
    `시가총액: ${formatKoreanCompact(item.marketCap, " 달러")}`,
    `당일 거래대금: ${formatKoreanCompact(item.tradingValue, " 달러")}`,
    `시총 대비 거래대금: ${item.turnoverRatio == null ? "확인 불가" : `${item.turnoverRatio.toFixed(2)}%`}`,
    `유통주: ${formatKoreanCompact(item.freeFloatShares, "주")} · 유통비율: ${item.freeFloatPercent == null ? "확인 불가" : `${item.freeFloatPercent}%`}`,
    `기준일: ${item.previousFiveTradingDays.join(", ")}`,
  ].join("\n")).join("\n\n");
  const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DAILY BREAKOUT", content }) });
  return { ok: response.ok, status: response.status, sent: response.ok ? items.length : 0 };
}
