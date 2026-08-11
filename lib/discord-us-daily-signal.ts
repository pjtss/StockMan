import { getUsDailyIndicatorsWebhook } from "@/lib/discord-us-daily-indicators";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

type Signal = { market: string; code: string; name?: string; [key: string]: unknown };
const DISCORD_CONTENT_LIMIT = 2_000;
const DISCORD_CONTENT_SAFE_LIMIT = 1_900;

function line(signal: Signal, metric: string) {
  const value = signal[metric];
  return `**${signal.market} ${signal.code}** ${signal.name || ""} · ${metric} ${value == null ? "-" : String(value)}`;
}

/** Build Discord-safe content chunks without cutting a candidate line in half. */
export function buildUsDailyIndicatorDiscordChunks(sections: string[]) {
  const prefix = "🚨 **일봉 지표 후보**\n";
  const chunks: string[] = [];
  let current = prefix;
  for (const section of sections) {
    for (const sectionLine of section.split("\n")) {
      const next = `${current}${sectionLine}\n`;
      if (current !== prefix && next.length > DISCORD_CONTENT_SAFE_LIMIT) {
        chunks.push(current.trimEnd());
        current = prefix;
      }
      // A single future-proofed line should still be delivered instead of
      // being silently dropped. Candidate lines are normally far below this.
      if (current.length + sectionLine.length + 1 > DISCORD_CONTENT_LIMIT) {
        chunks.push(current.trimEnd());
        current = `${prefix}${sectionLine.slice(0, DISCORD_CONTENT_SAFE_LIMIT - prefix.length)}\n`;
      } else {
        current += `${sectionLine}\n`;
      }
    }
  }
  if (current.trim() !== prefix.trim()) chunks.push(current.trimEnd());
  return chunks;
}

export async function sendUsDailyIndicatorSignals(input: { mfi?: Signal[]; dmi?: Signal[]; macd?: Signal[]; obv?: Signal[] }) {
  const webhook = await loadFeatureDiscordWebhook("us-daily-indicators", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  const sections = [
    input.mfi?.length ? `**MFI 과매도 후보**\n${input.mfi.slice(0, 20).map((item) => line(item, "mfi")).join("\n")}` : "",
    input.dmi?.length ? `**DMI 상승 후보**\n${input.dmi.slice(0, 20).map((item) => `${line(item, "plusDi")} · -DI ${item.minusDi ?? "-"} · ADX ${item.adx ?? "-"}`).join("\n")}` : "",
    input.macd?.length ? `**MACD 상승 후보**\n${input.macd.slice(0, 20).map((item) => `${line(item, "histogram")} · MACD ${item.macd ?? "-"} · Signal ${item.signal ?? "-"}`).join("\n")}` : "",
    input.obv?.length ? `**일봉 OBV Signal 상승 후보**\n${input.obv.slice(0, 20).map((item) => `${line(item, "change")} · OBV ${item.obv ?? "-"} · Signal ${item.obvSignal ?? "-"} · 상회 ${item.aboveSignalDays ?? 0}일 · 골든크로스 ${item.signalCrossoverDate ?? "-"}`).join("\n")}` : "",
  ].filter(Boolean);
  if (!sections.length) return { ok: true, sent: 0, skipped: true, reason: "no_candidates" };
  const chunks = buildUsDailyIndicatorDiscordChunks(sections);
  const count = (input.mfi?.length || 0) + (input.dmi?.length || 0) + (input.macd?.length || 0) + (input.obv?.length || 0);
  const responses = [];
  for (const content of chunks) {
    const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN DAILY INDICATORS", allowed_mentions: { parse: [] }, content }) });
    responses.push({ ok: response.ok, status: response.status, responseText: await response.text() });
  }
  const successful = responses.filter((response) => response.ok).length;
  return {
    ok: successful === responses.length,
    status: responses.find((response) => !response.ok)?.status ?? 200,
    sent: successful === responses.length ? count : 0,
    messagesSent: successful,
    messageCount: chunks.length,
    failures: responses.filter((response) => !response.ok).map(({ status, responseText }) => ({ status, responseText })),
  };
}
