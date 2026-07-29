import type { AlertItem } from "./types";

export type NewsRadarDiscordContext = {
  rate: number | null;
  tradingValue: number | null;
};

type Payload = {
  content: string;
  username: string;
  allowed_mentions: { parse: string[] };
  embeds: Array<{
    title: string;
    url: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
    footer: { text: string };
  }>;
};

export type NewsRadarDiscordSendResult = { ok: boolean; status: number; responseText: string };

function webhookUrl() { return process.env.NEWS_RADAR_DISCORD_WEBHOOK_URL?.trim() || ""; }
function truncate(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
function formatNumber(value: number | null) { return value === null ? "확인 불가" : value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }

export function isNewsRadarDiscordConfigured() { return Boolean(webhookUrl()); }

export function buildNewsRadarDiscordPayload(alert: AlertItem, context: NewsRadarDiscordContext): Payload {
  return {
    content: truncate(`🚨 해외주식 뉴스 속보 검증: ${alert.company}`, 2000),
    username: "STOCKMAN NEWS RADAR",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: truncate(`📰 ${alert.company} · ${alert.level}`, 256),
      url: alert.link,
      description: truncate(alert.title, 4096),
      color: 0xffb020,
      fields: [
        { name: "티커", value: alert.company, inline: true },
        { name: "현재 상승률", value: `${formatNumber(context.rate)}%`, inline: true },
        { name: "거래대금", value: formatNumber(context.tradingValue), inline: true },
        { name: "이벤트 ID", value: truncate(alert.externalId, 1024), inline: false },
      ],
      timestamp: alert.publishedAt,
      footer: { text: "STOCKMAN KIS News Radar" },
    }],
  };
}

export async function sendNewsRadarAlertToDiscord(alert: AlertItem, context: NewsRadarDiscordContext): Promise<NewsRadarDiscordSendResult> {
  const configured = webhookUrl();
  if (!configured) throw new Error("NEWS_RADAR_DISCORD_WEBHOOK_URL is not configured");
  const url = new URL(configured);
  url.searchParams.set("wait", "true");
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url.toString(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildNewsRadarDiscordPayload(alert, context)) });
    if (response.status === 200 || response.status === 204 || response.status < 400 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response) return { ok: false, status: 0, responseText: "Discord request was not made" };
  const responseText = await response.text();
  return { ok: response.status === 200 || response.status === 204, status: response.status, responseText };
}
