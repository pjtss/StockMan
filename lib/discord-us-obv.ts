import type { UsMinuteTurnoverPoint } from "@/lib/kis-us-minute-turnover";
import { getUsDailyIndicatorsWebhook } from "@/lib/discord-us-daily-indicators";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

export function buildUsObvDiscordPayload(items: Array<Record<string, unknown>>) {
  return {
    username: "STOCKMAN US OBV",
    allowed_mentions: { parse: [] as string[] },
    content: items.length ? `🚨 **OBV 상승 후보 ${items.length}종목**\n${items.map((item) => `**${item["market"]} ${item["code"]}** ${item["name"] || ""} · OBV ${Number(item["obv"] || 0).toLocaleString("en-US")} · 최근 30분 ${Number(item["recentObv"] || 0).toLocaleString("en-US")} · 1분봉 ${item["pointCount"]}개`).join("\n")}` : "OBV 상승 후보가 없습니다.",
  };
}

export async function sendUsObvToDiscord(items: Array<Record<string, unknown>>) {
  const webhook = await loadFeatureDiscordWebhook("us-obv", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "US_OBV_DISCORD_WEBHOOK_URL"]);
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildUsObvDiscordPayload(items)) });
  return { ok: response.ok, status: response.status, responseText: await response.text() };
}
