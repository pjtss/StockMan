import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import type { UsBollingerResult } from "@/lib/us-bollinger-band";

export async function sendUsBollingerBandSignals(results: UsBollingerResult[]) {
  const qualified = results.filter((result) => result.qualifies);
  if (!qualified.length) return { ok: true, skipped: true, reason: "no_candidates", sent: 0 };
  const webhook = await loadFeatureDiscordWebhook("us-bollinger-band", ["US_BOLLINGER_BAND_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { ok: false, skipped: true, reason: "webhook_not_configured", sent: 0 };
  const description = qualified.map((item) => `**${item.market} ${item.code}** ${item.name || ""} · 종가 ${item.close ?? "-"} · 하단 ${item.band?.lower ?? "-"} · 거래량 ${item.volume ?? "-"} · 시총 대비 거래대금 ${item.turnoverRatio ?? "-"}%`).join("\n").slice(0, 4_050);
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN BOLLINGER", allowed_mentions: { parse: [] }, embeds: [{ title: "🚨 해외주식 일봉 볼린저밴드 하단 이탈 알림", description, color: 0x7c3aed, footer: { text: "STOCKMAN · 종가와 하단선 비교 · 카드 1개 통합" }, timestamp: new Date().toISOString() }] }) });
  const responses = [{ ok: response.ok, status: response.status, responseText: await response.text() }];
  const sent = responses.filter((response) => response.ok).length;
  return { ok: sent === responses.length, sent: sent === responses.length ? qualified.length : 0, messagesSent: sent, messageCount: 1, failures: responses.filter((response) => !response.ok) };
}
