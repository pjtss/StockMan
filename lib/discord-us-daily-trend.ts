import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { toTextWebhookPayload } from "@/lib/discord-text";

export async function sendUsDailyTrendToDiscord(items: Array<Record<string, unknown>>) {
  const webhook = await loadFeatureDiscordWebhook("us-daily-indicators", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { ok: false, skipped: true, sent: 0, reason: "webhook_not_configured" };
  const qualified = items.filter((item) => item.qualifies);
  if (!qualified.length) return { ok: true, skipped: true, sent: 0, reason: "no_candidates" };
  const content = ["🚀 미국 일봉 급등 추세 통합 탐지", "OBV · MACD · MFI · 볼린저밴드 · DMI · 거래량", ...qualified.slice(0, 30).map((item) => `${item.market} ${item.code}${item.name ? ` | ${item.name}` : ""} · 점수 ${item.score}점 · 종가 ${item.close} · MFI ${item.mfi ?? "-"} · RVOL ${item.rvol == null ? "-" : Number(item.rvol).toFixed(2)}x`)].join("\n");
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toTextWebhookPayload({ username: "STOCKMAN DAILY TREND", allowed_mentions: { parse: [] }, content })) });
  return { ok: response.ok, skipped: false, sent: response.ok ? qualified.length : 0, status: response.status, responseText: await response.text() };
}
