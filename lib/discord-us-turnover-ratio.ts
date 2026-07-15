import type { UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";

const SUCCESS_STATUSES = new Set([200, 204]);

export function isUsTurnoverRatioDiscordConfigured() {
  return Boolean(process.env.US_TURNOVER_RATIO_DISCORD_WEBHOOK_URL?.trim());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

export function buildUsTurnoverRatioDiscordPayload(items: UsTurnoverRatioItem[]) {
  return {
    content: `시총 대비 거래대금 1~10% 종목 ${items.length}건을 감지했습니다.`,
    username: "STOCKMAN AMS TURNOVER",
    allowed_mentions: { parse: [] as string[] },
    embeds: items.slice(0, 10).map((item) => ({
      title: `${item.name || item.code} (${item.code})`,
      description: "미국 상승률 TOP 100 중 시총 대비 거래대금 조건을 충족했습니다.",
      color: 0x00ffa3,
      fields: [
        { name: "등락률", value: item.changeRate || "-", inline: true },
        { name: "현재가", value: item.price || "-", inline: true },
        { name: "시총 대비 거래대금", value: `${item.turnoverRatio.toFixed(2)}%`, inline: true },
        { name: "시가총액", value: formatNumber(item.marketCap), inline: true },
        { name: "당일 거래대금", value: formatNumber(item.tradingValue), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "STOCKMAN AMS Turnover Ratio Automation" },
    })),
  };
}

export async function sendUsTurnoverRatioToDiscord(items: UsTurnoverRatioItem[]) {
  const webhook = process.env.US_TURNOVER_RATIO_DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) throw new Error("US_TURNOVER_RATIO_DISCORD_WEBHOOK_URL is not configured");
  const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildUsTurnoverRatioDiscordPayload(items)),
  });
  const responseText = await response.text();
  return { ok: SUCCESS_STATUSES.has(response.status), status: response.status, responseText };
}
