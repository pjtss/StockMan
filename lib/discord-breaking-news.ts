import type { KisBreakingNews } from "./kis-news-radar";
import { loadFeatureDiscordWebhook } from "./discord-config";

function webhookUrl() { return process.env.KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL?.trim() || ""; }
function truncate(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

export async function isBreakingNewsDiscordConfigured() { return Boolean(await loadFeatureDiscordWebhook("us-breaking-news-forwarder", ["KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL"])); }

export function buildBreakingNewsPayload(event: KisBreakingNews) {
  return {
    content: truncate(`🚨 ${event.title}`, 2000),
    username: "STOCKMAN KIS BREAKING NEWS",
    allowed_mentions: { parse: [] as string[] },
  };
}

export async function sendBreakingNewsToDiscord(event: KisBreakingNews) {
  const configured = await loadFeatureDiscordWebhook("us-breaking-news-forwarder", ["KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL"]);
  if (!configured) throw new Error("KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL is not configured");
  const url = new URL(configured); url.searchParams.set("wait", "true");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildBreakingNewsPayload(event)) });
  const responseText = await response.text();
  return { ok: response.status === 200 || response.status === 204, status: response.status, responseText };
}
