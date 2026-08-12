import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import type { UsMinuteBollingerResult } from "@/lib/us-minute-bollinger-band";
export async function sendUsMinuteBollingerBandSignals(results: UsMinuteBollingerResult[]) {
  const qualified = results.filter((item) => item.qualifies); if (!qualified.length) return { ok: true, skipped: true, sent: 0, reason: "no_candidates" };
  const webhook = await loadFeatureDiscordWebhook("us-minute-bollinger-band", ["US_MINUTE_BOLLINGER_DISCORD_WEBHOOK_URL", "US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL"]); if (!webhook) return { ok: false, skipped: true, sent: 0, reason: "webhook_not_configured" };
  const description = qualified.map((item) => `**${item.market} ${item.code}** ${item.name} · TOP ${item.rank} · 등락률 ${item.changeRate ?? "-"}%\n현재 ${item.currentPrice} · 하단 ${item.lower?.toFixed(4)} · 중심 ${item.middle?.toFixed(4)} · 1분봉 ${item.pointCount}개`).join("\n\n").slice(0, 4050);
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN 1M BOLLINGER", allowed_mentions: { parse: [] }, embeds: [{ title: "🚨 해외주식 1분봉 볼린저밴드 하단", description, color: 0xef4444, footer: { text: "KIS · 상승률 TOP 기준 · 20개 1분봉" }, timestamp: new Date().toISOString() }] }) });
  return { ok: response.ok, sent: response.ok ? qualified.length : 0, messageCount: 1, status: response.status };
}
