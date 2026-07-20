import { formatKoreanAmount } from "@/lib/korean-number-format";

function formatWholeMan(value: number) {
  return formatKoreanAmount(Math.floor(value / 10_000) * 10_000);
}

function formatChangeRate(value: unknown) {
  const raw = String(value ?? "").replace(/%/g, "").trim();
  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed > 0 ? "+" : ""}${parsed}`;
}

export async function sendUsTurnoverWatchToDiscord(items: Array<Record<string, unknown>>) {
  const webhook = process.env.US_TURNOVER_WATCH_DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) throw new Error("US_TURNOVER_WATCH_DISCORD_WEBHOOK_URL is not configured");
  const payload = buildUsTurnoverWatchPayload(items);
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    lastStatus = response.status;
    if (response.ok) return { ok: true, status: response.status };
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error(`US turnover watch Discord failed with HTTP ${lastStatus}`);
}

export function buildUsTurnoverWatchPayload(items: Array<Record<string, unknown>>) {
  const embeds = items.map((item) => ({
    title: `${item.code} | ${item.market}`,
    color: 0x00ffa3,
    fields: [
      { name: "시총 대비 거래대금", value: `${Number(item.turnoverRatio).toFixed(2)}%`, inline: true },
      { name: "기준 비율", value: `${Number(item.threshold).toFixed(2)}%`, inline: true },
      { name: "시가총액", value: formatWholeMan(Number(item.marketCap)), inline: true },
      { name: "당일 거래대금", value: formatWholeMan(Number(item.tradingValue)), inline: true },
      { name: "등락률", value: formatChangeRate(item.changeRate), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "STOCKMAN US Turnover Watch" },
  }));
  return { username: "STOCKMAN US TURNOVER WATCH", allowed_mentions: { parse: [] }, embeds };
}
