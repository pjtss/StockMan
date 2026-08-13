import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { toTextWebhookPayload } from "@/lib/discord-text";

export async function sendUsDailyTrendToDiscord(items: Array<Record<string, unknown>>) {
  const webhook = await loadFeatureDiscordWebhook("us-daily-indicators", ["US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { ok: false, skipped: true, sent: 0, reason: "webhook_not_configured" };
  const qualified = items.filter((item) => item.qualifies);
  if (!qualified.length) return { ok: true, skipped: true, sent: 0, reason: "no_candidates" };
  const header = ["🚀 미국 일봉 급등 추세 통합 탐지", "OBV · MACD · MFI · 볼린저밴드 · DMI · 가격추세 · 거래량"];
  const lines: string[] = [];
  for (const item of qualified.slice(0, 30)) {
    const parts = (item.scoreParts || {}) as Record<string, unknown>;
    const points = (key: string) => Number(parts[key] ?? 0);
    const line = `${item.market} ${item.code}${item.name ? ` | ${item.name}` : ""} · ${item.score}점 · 시가 ${item.open ?? "-"} · 이전5일고가 ${item.previousFiveDayHigh ?? "-"} · 종가 ${item.close} · MFI ${item.mfi ?? "-"} · RVOL ${item.rvol == null ? "-" : Number(item.rvol).toFixed(2)}x\n  일봉 돌파 ${item.dailyBreakout ? "YES" : "NO"} · 추세 ${points("priceTrend")} · OBV ${points("obv")} · MACD ${points("macd")} · MFI ${points("mfi")} · BB ${points("bollinger")} · DMI ${points("dmi")} · 거래량 ${points("volume")}`;
    const candidate = [...header, ...lines, line].join("\n");
    if (candidate.length > 1900) break;
    lines.push(line);
  }
  const omitted = qualified.length - lines.length;
  const content = [...header, ...lines, ...(omitted > 0 ? [`외 ${omitted}개 종목은 길이 제한으로 생략`] : [])].join("\n").slice(0, 2000);
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toTextWebhookPayload({ username: "STOCKMAN DAILY TREND", allowed_mentions: { parse: [] }, content })) });
  return { ok: response.ok, skipped: false, sent: response.ok ? qualified.length : 0, status: response.status, responseText: await response.text() };
}
