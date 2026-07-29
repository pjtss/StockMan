import type { KisBreakingNews } from "./kis-news-radar";

function webhookUrl() { return process.env.KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL?.trim() || ""; }
function truncate(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

export function isBreakingNewsDiscordConfigured() { return Boolean(webhookUrl()); }

export function buildBreakingNewsPayload(event: KisBreakingNews) {
  const publishedAt = `${event.date.slice(0, 4)}-${event.date.slice(4, 6)}-${event.date.slice(6, 8)}T${event.time.slice(0, 2)}:${event.time.slice(2, 4)}:${event.time.slice(4, 6)}+09:00`;
  return {
    content: truncate(`🚨 해외 속보: ${event.title}`, 2000),
    username: "STOCKMAN KIS BREAKING NEWS",
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: truncate(event.title, 256), description: truncate(event.symbols.map((symbol) => `${symbol.name || symbol.ticker} (${symbol.ticker})`).join(", ") || "관련 종목 없음", 4096),
      color: 0xff4d4f, fields: [{ name: "출처", value: event.source || "확인 불가", inline: true }, { name: "제공기관 코드", value: event.providerCode || "확인 불가", inline: true }, { name: "속보 ID", value: event.id, inline: false }], timestamp: publishedAt, footer: { text: "KIS 해외 속보 원문 전달" },
    }],
  };
}

export async function sendBreakingNewsToDiscord(event: KisBreakingNews) {
  const configured = webhookUrl();
  if (!configured) throw new Error("KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL is not configured");
  const url = new URL(configured); url.searchParams.set("wait", "true");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildBreakingNewsPayload(event)) });
  const responseText = await response.text();
  return { ok: response.status === 200 || response.status === 204, status: response.status, responseText };
}
