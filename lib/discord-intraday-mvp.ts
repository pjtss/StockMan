import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

export type IntradayMvpAlert = { market: string; code: string; marketCap: number; rollingTradingValue: number; ratioPercent: number; windowMinutes: number; observedAt: string };

export async function sendIntradayMvpAlerts(items: IntradayMvpAlert[]) {
  if (!items.length) return { ok: true, sent: false, skipped: true, reason: "no_qualified_items", itemCount: 0 };
  const settings = await loadFeatureModuleSettings("intraday-mvp").catch(() => null);
  const configured = settings?.featureSettings?.intradayMvpPolicy?.webhookUrl?.trim();
  const webhook = configured || await loadFeatureDiscordWebhook("intraday-mvp", ["INTRADAY_MVP_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { ok: true, sent: false, skipped: true, reason: "webhook_not_configured", itemCount: items.length };
  const lines = items.map((item) => `${item.market} ${item.code} | 시총 대비 거래대금 ${item.ratioPercent.toFixed(2)}% | ${item.windowMinutes}분`);
  const url = new URL(webhook); url.searchParams.set("wait", "true");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "STOCKMAN INTRADAY MVP", content: `🚨 TOP100 장중 거래대금 조건 충족\n${lines.join("\n")}`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) });
  return { ok: response.ok, sent: response.ok, skipped: false, status: response.status, itemCount: items.length };
}
