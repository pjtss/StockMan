import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import type { UsBollingerResult } from "@/lib/us-bollinger-band";

export async function sendUsBollingerBandSignals(results: UsBollingerResult[]) {
  const qualified = results.filter((result) => result.qualifies);
  if (!qualified.length) return { ok: true, skipped: true, reason: "no_candidates", sent: 0 };
  const webhook = await loadFeatureDiscordWebhook("us-bollinger-band", ["US_BOLLINGER_BAND_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { ok: false, skipped: true, reason: "webhook_not_configured", sent: 0 };
  const chunks: string[] = [];
  let current = "🚨 **일봉 볼린저밴드 하단 이탈 후보**\n";
  for (const item of qualified) {
    const line = `**${item.market} ${item.code}** ${item.name || ""} · 종가 ${item.close ?? "-"} · 하단 ${item.band?.lower ?? "-"} · 거래량 ${item.volume ?? "-"} · 시총 대비 거래대금 ${item.turnoverRatio ?? "-"}%\n`;
    if (current.length + line.length > 1_850) { chunks.push(current.trimEnd()); current = "🚨 **일봉 볼린저밴드 하단 이탈 후보**\n"; }
    current += line;
  }
  if (current.trim() !== "🚨 **일봉 볼린저밴드 하단 이탈 후보**") chunks.push(current.trimEnd());
  const responses = [];
  for (const content of chunks) {
    const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN BOLLINGER", allowed_mentions: { parse: [] }, content }) });
    responses.push({ ok: response.ok, status: response.status, responseText: await response.text() });
  }
  const sent = responses.filter((response) => response.ok).length;
  return { ok: sent === responses.length, sent: sent === responses.length ? qualified.length : 0, messagesSent: sent, messageCount: chunks.length, failures: responses.filter((response) => !response.ok) };
}
