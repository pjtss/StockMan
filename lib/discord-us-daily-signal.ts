import { getUsDailyIndicatorsWebhook } from "@/lib/discord-us-daily-indicators";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

type Signal = { market: string; code: string; name?: string; [key: string]: unknown };

function line(signal: Signal, metric: string) {
  const value = signal[metric];
  return `**${signal.market} ${signal.code}** ${signal.name || ""} · ${metric} ${value == null ? "-" : String(value)}`;
}

export async function sendUsDailyIndicatorSignals(input: { mfi?: Signal[]; dmi?: Signal[]; macd?: Signal[]; obv?: Signal[] }) {
  const webhook = await loadFeatureDiscordWebhook("us-daily-indicators", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  const sections = [
    input.mfi?.length ? `**MFI 과매도 후보**\n${input.mfi.slice(0, 20).map((item) => line(item, "mfi")).join("\n")}` : "",
    input.dmi?.length ? `**DMI 상승 후보**\n${input.dmi.slice(0, 20).map((item) => `${line(item, "plusDi")} · -DI ${item.minusDi ?? "-"} · ADX ${item.adx ?? "-"}`).join("\n")}` : "",
    input.macd?.length ? `**MACD 상승 후보**\n${input.macd.slice(0, 20).map((item) => `${line(item, "histogram")} · MACD ${item.macd ?? "-"} · Signal ${item.signal ?? "-"}`).join("\n")}` : "",
    input.obv?.length ? `**일봉 OBV 상승 후보**\n${input.obv.slice(0, 20).map((item) => `${line(item, "change")} · 상승 바 비율 ${item.risingBarRate == null ? "-" : `${(Number(item.risingBarRate) * 100).toFixed(1)}%`}`).join("\n")}` : "",
  ].filter(Boolean);
  if (!sections.length) return { ok: true, sent: 0, skipped: true, reason: "no_candidates" };
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DAILY INDICATORS", allowed_mentions: { parse: [] }, content: `🚨 **일봉 지표 후보**\n${sections.join("\n\n")}` }) });
  const count = (input.mfi?.length || 0) + (input.dmi?.length || 0) + (input.macd?.length || 0) + (input.obv?.length || 0);
  return { ok: response.ok, status: response.status, sent: response.ok ? count : 0, responseText: await response.text() };
}
