import type { AlertItem } from "./types";

type DiscordWebhookPayload = {
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

export type DartDiscordSendResult = {
  ok: boolean;
  status: number;
  responseText: string;
};

const DISCORD_SUCCESS_STATUSES = new Set([200, 204]);

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getDartDiscordWebhookUrl() {
  return process.env.DART_DISCORD_WEBHOOK_URL?.trim() || "";
}

export function isDartDiscordConfigured() {
  return Boolean(getDartDiscordWebhookUrl());
}

export function buildDartDiscordWebhookPayload(alert: AlertItem): DiscordWebhookPayload {
  const keywords = alert.keywords?.length ? alert.keywords.join(", ") : "-";

  return {
    content: truncate(`DART 신규 호재 공시: ${alert.company}`, 2000),
    username: "STOCKMAN DART",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncate(`[${alert.level}] ${alert.company}`, 256),
        url: alert.link,
        description: truncate(alert.title, 4096),
        color: alert.level === "최강호재" ? 0x00ffa3 : 0x22d3ee,
        fields: [
          { name: "판정", value: alert.level, inline: true },
          { name: "키워드", value: truncate(keywords, 1024), inline: true },
          { name: "접수번호", value: alert.externalId, inline: true },
        ],
        timestamp: alert.publishedAt,
        footer: { text: "STOCKMAN DART Automation" },
      },
    ],
  };
}

export async function sendDartAlertToDiscord(alert: AlertItem): Promise<DartDiscordSendResult> {
  const webhookUrl = getDartDiscordWebhookUrl();
  if (!webhookUrl) {
    throw new Error("DART_DISCORD_WEBHOOK_URL is not configured");
  }

  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDartDiscordWebhookPayload(alert)),
  });
  const responseText = await response.text();

  return {
    ok: DISCORD_SUCCESS_STATUSES.has(response.status),
    status: response.status,
    responseText,
  };
}
