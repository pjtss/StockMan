import type { UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import type { UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { formatKoreanAmount } from "@/lib/korean-number-format";

const SUCCESS_STATUSES = new Set([200, 204]);

function formatWholeMan(value: number) {
  return formatKoreanAmount(Math.floor(value / 10_000) * 10_000);
}

export function isUsTurnoverRatioDiscordConfigured() {
  return Boolean(
    process.env.US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL?.trim() &&
    process.env.US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL?.trim(),
  );
}

export function buildUsTurnoverRatioDiscordPayload(items: Array<UsTurnoverRatioItem | UsTurnoverRatioItemWithTrend>) {
  return {
    username: "STOCKMAN US TURNOVER",
    allowed_mentions: { parse: [] as string[] },
    embeds: items.slice(0, 10).map((item) => ({
      title: `${item.code} | ${item.name || item.code}`,
      color: 0x00ffa3,
      fields: [
        { name: "시가총액", value: formatWholeMan(item.marketCap), inline: true },
        { name: "당일 거래대금", value: formatWholeMan(item.tradingValue), inline: true },
        { name: "등락률", value: item.changeRate || "-", inline: true },
        { name: "시총 대비 거래대금", value: `${item.turnoverRatio.toFixed(2)}%`, inline: true },
        { name: "시가 대비 고점", value: `${item.openToHighRate.toFixed(2)}%`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "STOCKMAN US Turnover Ratio Automation" },
    })),
  };
}

export async function sendUsTurnoverRatioToDiscord(items: UsTurnoverRatioItem[], webhookUrl: string) {
  const webhook = webhookUrl.trim();
  if (!webhook) throw new Error("US_TURNOVER_RATIO_DISCORD_WEBHOOK_URL is not configured");
  const chunks: UsTurnoverRatioItem[][] = [];
  for (let index = 0; index < items.length; index += 10) {
    chunks.push(items.slice(index, index + 10));
  }

  const results = [];
  for (const chunk of chunks) {
    const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildUsTurnoverRatioDiscordPayload(chunk)),
    });
    results.push({ status: response.status, responseText: await response.text() });
    if (!SUCCESS_STATUSES.has(response.status)) {
      return { ok: false, status: response.status, responseText: results.map((result) => result.responseText).join("\n") };
    }
  }

  return {
    ok: true,
    status: results.at(-1)?.status ?? 204,
    responseText: results.map((result) => result.responseText).join("\n"),
  };
}
