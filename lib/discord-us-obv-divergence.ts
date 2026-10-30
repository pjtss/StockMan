import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import type { UsObvDivergenceScanPayload } from "@/lib/us-obv-divergence-scan";

const CONTENT_LIMIT = 1_850;

export async function resolveUsObvDivergenceWebhook() {
  const value = await loadFeatureDiscordWebhook("us-obv-divergence-snapshot", ["US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL"]);
  if (!value) throw new Error("US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL is not configured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "discord.com" || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname)) {
    throw new Error("INVALID_US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL");
  }
  return url;
}

function formatCandidate(item: UsObvDivergenceScanPayload["items"][number]) {
  const name = item.name ? ` · ${item.name}` : "";
  const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
  const updatedAt = item.candleMetadata?.at(-1)?.dataUpdatedAtUtc ?? "미상";
  return `• **${item.market} ${item.ticker}**${name} · ${item.signalType}/${item.signalQuality} · 종가 ${usd(item.close)} · 20봉 ${item.price20dPct.toFixed(2)}% · OBV ${item.obv20dAvgVolumeMultiple.toFixed(2)}x · 기준봉 ${item.candleDate} · 갱신 ${updatedAt}`;
}

function makeMessages(payload: UsObvDivergenceScanPayload) {
  const header = [
    `📊 미국 보통주 일봉 OBV 다이버전스 · ${payload.scanStatus}`,
    `기준일 ${payload.asOfEtDate} ET · 후보 ${payload.items.length}개 · USD 시총 $100M 이하 · 공식 대상 ${payload.universe.eligibleCommonStockCount.toLocaleString()}개 · 커버리지 ${payload.universe.evaluatedCoveragePct}%`,
    "WATCH_ONLY · 매수 추천 아님 · 기업행사 보정 미검증",
  ].join("\n");
  if (!payload.items.length) return [header + "\n티커: 없음\n해당 조건을 충족한 후보가 없습니다."];
  const messages: string[] = [];
  const tickerGroups: string[] = [];
  let tickerGroup = "";
  for (const ticker of payload.items.map((item) => item.ticker)) {
    const next = tickerGroup ? `${tickerGroup}, ${ticker}` : ticker;
    if (next.length > 1_500 && tickerGroup) {
      tickerGroups.push(tickerGroup);
      tickerGroup = ticker;
    } else tickerGroup = next;
  }
  if (tickerGroup) tickerGroups.push(tickerGroup);
  tickerGroups.forEach((group, index) => messages.push(`${header}\n티커${tickerGroups.length > 1 ? ` (${index + 1}/${tickerGroups.length})` : ""}: ${group}`));
  let current = header;
  for (const item of payload.items) {
    const line = formatCandidate(item);
    if (current.length + line.length + 1 > CONTENT_LIMIT) {
      messages.push(current);
      current = `${header}\n(계속)\n${line}`;
    } else current += `\n${line}`;
  }
  if (current) messages.push(current);
  return messages;
}

export async function sendUsObvDivergenceToDiscord(
  payload: UsObvDivergenceScanPayload,
  webhook?: URL,
) {
  const endpoint = webhook ?? await resolveUsObvDivergenceWebhook();
  endpoint.searchParams.set("wait", "true");
  const messages = makeMessages(payload);
  let sent = 0;
  for (const content of messages) {
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "STOCKMAN OBV DIVERGENCE", content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) break;
      if (attempt === 3 || (response.status !== 429 && response.status < 500)) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1_000, 10_000) : attempt * 1_000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (!response?.ok) {
      return { ok: false, deliveredMessages: sent, failedStatus: response?.status ?? null };
    }
    sent += 1;
  }
  return { ok: true, deliveredMessages: sent, deliveredTickers: payload.items.length };
}
