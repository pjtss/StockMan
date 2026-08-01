import type { UsFiveDayHighBreakoutResult } from "@/lib/us-five-day-high-breakout";

export async function sendUsDailyBreakoutToDiscord(items: UsFiveDayHighBreakoutResult[]) {
  const webhook = process.env.US_DAILY_BREAKOUT_DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) throw new Error("US_DAILY_BREAKOUT_DISCORD_WEBHOOK_URL is not configured");
  if (!items.length) return { ok: true, sent: 0 };
  const content = items.map((item) => [
    `🚨 **${item.market} ${item.code} 5일 고가 돌파**`,
    `현재가: ${item.currentPrice}`, `직전 5거래일 최고가: ${item.previousFiveDayHigh}`,
    `기준일: ${item.previousFiveTradingDays.join(", ")}`,
  ].join("\n")).join("\n\n");
  const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DAILY BREAKOUT", content }) });
  return { ok: response.ok, status: response.status, sent: response.ok ? items.length : 0 };
}

