import type { UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import type { UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { formatKoreanAmount } from "@/lib/korean-number-format";

const SUCCESS_STATUSES = new Set([200, 204]);

export function isUsTurnoverRatioDiscordConfigured() {
  return Boolean(process.env.US_TURNOVER_RATIO_DISCORD_WEBHOOK_URL?.trim());
}

export function buildUsTurnoverRatioDiscordPayload(items: Array<UsTurnoverRatioItem | UsTurnoverRatioItemWithTrend>) {
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
        { name: "시가총액", value: formatKoreanAmount(item.marketCap), inline: true },
        { name: "당일 거래대금", value: formatKoreanAmount(item.tradingValue), inline: true },
        ...( "trend" in item ? [
          { name: "1분 거래대금 변화", value: item.trend.oneMinuteTradingValueIncrease === null ? "데이터 수집 중" : `${item.trend.oneMinuteTradingValueIncrease >= 0 ? "+" : ""}${formatKoreanAmount(item.trend.oneMinuteTradingValueIncrease)}`, inline: true },
          { name: "3분 거래대금 변화", value: item.trend.threeMinuteTradingValueIncrease === null ? "데이터 수집 중" : `${item.trend.threeMinuteTradingValueIncrease >= 0 ? "+" : ""}${formatKoreanAmount(item.trend.threeMinuteTradingValueIncrease)}`, inline: true },
          { name: "5분 거래대금 변화", value: item.trend.fiveMinuteTradingValueIncrease === null ? "데이터 수집 중" : `${item.trend.fiveMinuteTradingValueIncrease >= 0 ? "+" : ""}${formatKoreanAmount(item.trend.fiveMinuteTradingValueIncrease)}`, inline: true },
          { name: "1분 변화", value: item.trend.oneMinuteIncrease === null ? "데이터 수집 중" : `${item.trend.oneMinuteIncrease >= 0 ? "+" : ""}${item.trend.oneMinuteIncrease.toFixed(2)}%p`, inline: true },
          { name: "3분 변화", value: item.trend.threeMinuteIncrease === null ? "데이터 수집 중" : `${item.trend.threeMinuteIncrease >= 0 ? "+" : ""}${item.trend.threeMinuteIncrease.toFixed(2)}%p`, inline: true },
          { name: "5분 변화", value: item.trend.fiveMinuteIncrease === null ? "데이터 수집 중" : `${item.trend.fiveMinuteIncrease >= 0 ? "+" : ""}${item.trend.fiveMinuteIncrease.toFixed(2)}%p`, inline: true },
        ] : []),
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
