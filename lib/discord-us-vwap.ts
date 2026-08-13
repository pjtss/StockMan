import { formatKoreanCompact } from "@/lib/korean-number-format";
import { toTextWebhookPayload } from "@/lib/discord-text";

export type UsVwapDiscordItem = {
  market: string;
  code: string;
  name?: string;
  currentPrice: number | null;
  vwap: number | null;
  aboveVwapPercent: number | null;
  totalVolume: number;
  totalTradeValue: number;
  marketCap: number | null;
  turnoverRatio: number | null;
  changeRate: number | null;
  pointCount: number;
  complete: boolean;
  sessionDate: string;
};

const SUCCESS_STATUSES = new Set([200, 204]);

function number(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function amount(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "-" : formatKoreanCompact(value, " 달러");
}

function signed(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

export function buildUsVwapDiscordPayload(items: UsVwapDiscordItem[]) {
  return {
    username: "STOCKMAN US VWAP",
    allowed_mentions: { parse: [] as string[] },
    embeds: items.slice(0, 10).map((item) => ({
      title: `📈 ${item.market} ${item.code} | ${item.name || item.code}`,
      description: "당일 전체 세션 기준 현재가가 VWAP 위에 있습니다.",
      color: 0x2dd4bf,
      fields: [
        { name: "현재가", value: number(item.currentPrice, 4), inline: true },
        { name: "당일 VWAP", value: number(item.vwap, 4), inline: true },
        { name: "VWAP 상회율", value: signed(item.aboveVwapPercent, "%"), inline: true },
        { name: "당일 거래대금", value: amount(item.totalTradeValue), inline: true },
        { name: "거래량", value: Number.isFinite(item.totalVolume) ? item.totalVolume.toLocaleString("en-US") : "-", inline: true },
        { name: "시가총액", value: amount(item.marketCap), inline: true },
        { name: "시총 대비 거래대금", value: item.turnoverRatio == null ? "-" : `${item.turnoverRatio.toFixed(2)}%`, inline: true },
        { name: "등락률", value: signed(item.changeRate, "%"), inline: true },
        { name: "데이터", value: `${item.pointCount}개 포인트 · ${item.complete ? "완료" : "미완료"}`, inline: true },
      ],
      footer: { text: `세션 ${item.sessionDate} · 프리/정규/애프터마켓` },
      timestamp: new Date().toISOString(),
    })),
  };
}

export async function sendUsVwapToDiscord(items: UsVwapDiscordItem[], webhookUrl: string) {
  const webhook = webhookUrl.trim();
  if (!webhook) throw new Error("VWAP Discord webhook is not configured");
  const results: Array<{ status: number; responseText: string }> = [];
  for (let index = 0; index < items.length; index += 10) {
    const chunk = items.slice(index, index + 10);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toTextWebhookPayload(buildUsVwapDiscordPayload(chunk) as unknown as Record<string, unknown>)),
      });
      if (SUCCESS_STATUSES.has(response.status) || response.status < 400 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!response) return { ok: false, status: 0, responseText: "Discord request was not made" };
    const responseText = await response.text();
    results.push({ status: response.status, responseText });
    if (!SUCCESS_STATUSES.has(response.status)) return { ok: false, status: response.status, responseText: results.map((result) => result.responseText).join("\n") };
  }
  return { ok: true, status: results.at(-1)?.status ?? 204, responseText: results.map((result) => result.responseText).join("\n") };
}
