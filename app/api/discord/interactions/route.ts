import { NextResponse } from "next/server";
import { verifyDiscordSignature } from "@/lib/discord-interaction-security";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { runKrDailyCacheNow } from "@/lib/kr-daily-cache-job";
import { withAutomationRun } from "@/lib/automation-run";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";
import { runUsDailyFilterRefresh } from "@/lib/us-daily-filter-refresh";
import { filterUsDailyCandidates } from "@/lib/us-daily-common-filter";
import { fetchTickerNews, type KisNewsPeriod } from "@/lib/kis-news-radar";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { scanUsDailyTrend } from "@/lib/us-daily-trend-scan";
import { sendUsDailyTrendToDiscord } from "@/lib/discord-us-daily-trend";
import { formatDisplayNumber, formatDisplayPercent } from "@/lib/display-number";
import { getDailyCacheCommand, loadDailyCacheCommand, splitDailyCacheCommand, type DailyCacheCommand } from "@/lib/discord-daily-cache";
import { getTickerInfo, formatTickerInfo } from "@/lib/discord-ticker-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionValue(data: any, name: string) {
  return data?.options?.find((option: any) => option?.name === name)?.value;
}

async function updateOriginalResponse(applicationId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
}

async function sendDailyCacheResponses(applicationId: string, token: string, chunks: string[]) {
  await updateOriginalResponse(applicationId, token, chunks[0] ?? "캐시 결과가 없습니다.");
  for (const content of chunks.slice(1)) {
    await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
  }
}

function formatBreakoutResult(result: Awaited<ReturnType<typeof runUsDailyBreakoutScan>>) {
  if (!result.qualified.length) return [`오늘 5거래일 고가 돌파 종목이 없습니다. (통합 종목 ${result.instrumentCount}개)`, "", "분석 대상", ...result.results.map((item) => `- ${item.market} ${item.code}: ${item.error || `현재가 ${item.currentPrice} / 직전 5일 최고가 ${item.previousFiveDayHigh} (미돌파)`}`)].join("\n");
  return [`🚨 **일봉 5거래일 고가 돌파 후보**`, `통합 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [
    `**${item.market} ${item.code}**`,
    `당일 시가 ${item.currentPrice} · 직전 5일 최고가 ${item.previousFiveDayHigh}`,
    `등락률 ${formatDisplayPercent(item.rate)} · 거래량 ${formatDisplayNumber(item.volume)}`,
    `시총 ${formatDisplayNumber(item.marketCap)} · 거래대금 ${formatDisplayNumber(item.tradingValue)} · 시총 대비 ${formatDisplayPercent(item.turnoverRatio)}`,
    `유통주 ${formatDisplayNumber(item.freeFloatShares)} · 유통비율 ${formatDisplayPercent(item.freeFloatPercent)}`,
  ].join("\n"))].join("\n\n");
}

function formatMfiResult(result: Awaited<ReturnType<typeof scanStoredUsMfiOversold>>) {
  if (!result.qualified.length) return [`일봉 MFI ${result.threshold} 이하 종목이 없습니다.`, `분석 종목 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`].join("\n");
  return [`📉 **일봉 MFI 과매도 후보**`, `기준: MFI ≤ ${result.threshold} · 기간: ${result.period}`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `MFI ${item.mfi?.toFixed(2)} · 기준일 ${item.mfiDate} · 일봉 ${item.candleCount}개`].join("\n"))].join("\n\n");
}
function formatDmiResult(result: Awaited<ReturnType<typeof scanStoredUsDmi>>) {
  if (!result.qualified.length) return [`일봉 DMI 상승 방향(+DI > -DI) 종목이 없습니다.`, `분석 종목 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`].join("\n");
  return [`📈 **일봉 DMI 후보**`, `기준: +DI > -DI · 기간: ${result.period}`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `+DI ${item.plusDi.toFixed(2)} · -DI ${item.minusDi.toFixed(2)} · ADX ${item.adx.toFixed(2)} · 기준일 ${item.date}`].join("\n"))].join("\n\n");
}
function formatMacdResult(result: Awaited<ReturnType<typeof scanStoredUsMacd>>) {
  if (!result.qualified.length) return [`일봉 MACD 상승 모멘텀 종목이 없습니다.`, `기준 ${result.fast}/${result.slow}/${result.signal} · 분석 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`].join("\n");
  return [`📊 **일봉 MACD 상승 후보**`, `기준: ${result.fast}/${result.slow}/${result.signal} · MACD > Signal`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `MACD ${formatDisplayNumber(item.macd)} · Signal ${formatDisplayNumber(item.signal)} · Histogram ${formatDisplayNumber(item.histogram)}`, item.goldenCross ? "🟢 골든크로스" : "상승 모멘텀 유지"].join("\n"))].join("\n\n");
}
function formatDailyObvResult(result: Awaited<ReturnType<typeof scanStoredUsDailyObv>>) {
  if (!result.qualified.length) return [`일봉 OBV 상승 종목이 없습니다.`, `기준: 최근 ${result.lookback}거래일 · 분석 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`].join("\n");
  return [`📊 **일봉 OBV 상승 후보**`, `기준: 최근 ${result.lookback}거래일 비교 · Signal EMA ${result.signalPeriod} · ${result.signalAboveDays}일 연속 상회 · 최근 ${result.signalCrossLookback}일 골든크로스`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `OBV ${item.obv} · Signal ${item.obvSignal} · 괴리 ${item.signalGap}`, `OBV 변화 ${item.change} · Signal 상회 ${item.aboveSignalDays}일 · 골든크로스 ${item.signalCrossoverDate ?? "-"}`, `종가 ${item.lastClose} · 기준일 ${item.date}`].join("\n"))].join("\n\n");
}
function formatUsDailyCacheResult(result: Awaited<ReturnType<typeof warmUsDailyPriceCache>>) {
  return [`✅ **해외 일봉 캐시 갱신 완료**`, `대상 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`, `저장 캔들 ${result.savedCandleCount}개`, `시작 ${result.startedAt} · 완료 ${result.completedAt}`, result.failures.length ? `실패 원인 예시: ${result.failures.slice(0, 5).map((item) => `${item.market} ${item.code} (${item.error})`).join(", ")}` : "모든 종목의 해외 일봉 데이터가 DB에 저장되었습니다."].join("\n");
}
function formatKrDailyCacheResult(result: Awaited<ReturnType<typeof runKrDailyCacheNow>>) {
  const failed = result.results.filter((item: any) => item.error).slice(0, 5);
  return [`✅ **국내 일봉 캐시 갱신 완료**`, `대상 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`, `처리 ${result.processedCount}개`, `시작 ${result.startedAt} · 완료 ${result.completedAt}`, failed.length ? `실패 원인 예시: ${failed.map((item: any) => `${item.market} ${item.code} (${item.error})`).join(", ")}` : "모든 종목의 국내 일봉 데이터가 DB에 저장되었습니다."].join("\n");
}
function formatDailyTrendResult(result: Awaited<ReturnType<typeof scanUsDailyTrend>>) {
  if (!result.qualified.length) return [`일봉 급등 추세 후보가 없습니다.`, `기준 점수 ${result.policy.minScore}점 · RVOL ${result.policy.minRvol}x · 분석 ${result.instrumentCount}개`].join("\n");
  return [`🚀 **일봉 급등 추세 통합 후보**`, `기준 점수 ${result.policy.minScore}점 이상 · RVOL ${result.policy.minRvol}x 이상`, `OBV · MACD · MFI · 볼린저밴드 · DMI · 거래량`, `조건 충족 ${result.qualified.length}개`, "", ...result.qualified.slice(0, 20).map((item: any) => `${item.market} ${item.code}${item.name ? ` | ${item.name}` : ""} · 점수 ${item.score}점 · MFI ${item.mfi ?? "-"} · RVOL ${item.rvol == null ? "-" : Number(item.rvol).toFixed(2)}x`)].join("\n");
}

function formatNewsResult(result: Awaited<ReturnType<typeof fetchTickerNews>>) {
  if (!result.items.length) return `📰 **${result.ticker} 뉴스**\n조회 기간 ${result.fromDate} ~ ${result.toDate}\n해당 기간에 조회된 뉴스가 없습니다.`;
  const lines = result.items.slice(0, 40).map((item) => `• ${item.date} ${item.time} | ${item.title}${item.source ? ` (${item.source})` : ""}`);
  return [`📰 **${result.ticker} 뉴스**`, `조회 기간 ${result.fromDate} ~ ${result.toDate} · ${result.items.length}건`, "", ...lines].join("\n").slice(0, 1900);
}

async function notifyDailyWebhook(task: string, send: () => Promise<unknown>) {
  try {
    await send();
    return `\n\n✅ 통합 일봉 Webhook 전송 완료 (${task})`;
  } catch (error) {
    console.error(`[Discord] daily webhook failed (${task})`, error);
    return `\n\n⚠️ 통합 일봉 Webhook 전송 실패 (${task})`;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) return new NextResponse("invalid request signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (["daily-obv", "mfi-oversold", "dmi", "macd", "daily-trend", "daily-filter-refresh"].includes(interaction.data?.name)) return NextResponse.json({ type: 4, data: { content: "일봉 OBV·MFI·MACD·DMI·ADL 기능은 현재 비활성화되어 있습니다.", flags: 64 } });
  const cacheCommand = getDailyCacheCommand(interaction.data?.name);
  if (interaction.type !== 2 || (!cacheCommand && !["ticker", "news", "daily-breakout", "daily-obv", "mfi-oversold", "dmi", "macd", "daily-trend", "refresh-daily", "refresh-us-daily", "refresh-kr-daily", "daily-filter-refresh"].includes(interaction.data?.name))) return NextResponse.json({ type: 4, data: { content: "지원하지 않는 명령어입니다.", flags: 64 } });
  const ticker = String(optionValue(interaction.data, "symbol") || "").trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID || interaction.application_id;
  if (interaction.data.name === "ticker") {
    void getTickerInfo(ticker).then((result) => updateOriginalResponse(applicationId, interaction.token, formatTickerInfo(result))).catch((error) => updateOriginalResponse(applicationId, interaction.token, `티커 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`));
  } else if (cacheCommand) {
    void loadDailyCacheCommand(interaction.data.name as DailyCacheCommand).then((result) => sendDailyCacheResponses(applicationId, interaction.token, splitDailyCacheCommand(result))).catch((error) => updateOriginalResponse(applicationId, interaction.token, `캐시 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`));
  } else if (["refresh-daily", "refresh-us-daily", "refresh-kr-daily"].includes(interaction.data.name)) {
    const isKr = interaction.data.name === "refresh-kr-daily";
    const moduleKey = isKr ? "kr-daily-cache" : "us-daily-cache";
    const runRefresh = isKr
      ? withAutomationRun("kr-daily-cache", runKrDailyCacheNow).then((result) => updateOriginalResponse(applicationId, interaction.token, formatKrDailyCacheResult(result)))
      : withAutomationRun("us-daily-cache", warmUsDailyPriceCache).then((result) => updateOriginalResponse(applicationId, interaction.token, formatUsDailyCacheResult(result)));
    void runRefresh.catch((error) => updateOriginalResponse(applicationId, interaction.token, `${isKr ? "국내" : "해외"} 일봉 캐시 갱신 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`));
  } else if (interaction.data.name === "daily-breakout") {
    void runUsDailyBreakoutScan().then(async (result) => {
      const filtered = await filterUsDailyCandidates(result.qualified as any);
      const webhookStatus = await notifyDailyWebhook("5거래일 고가 돌파", () => sendUsDailyBreakoutToDiscord(filtered.filtered as any));
      return updateOriginalResponse(applicationId, interaction.token, webhookStatus.trim());
    }).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 돌파 후보를 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "daily-obv") {
    void scanStoredUsDailyObv().then(async (result) => {
      const filtered = await filterUsDailyCandidates(result.qualified as any);
      const webhookStatus = await notifyDailyWebhook("일봉 OBV", () => sendUsDailyIndicatorSignals({ obv: filtered.filtered as any }));
      return updateOriginalResponse(applicationId, interaction.token, webhookStatus.trim());
    }).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 OBV 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "mfi-oversold") {
    void scanStoredUsMfiOversold().then(async (result) => {
      const filtered = await filterUsDailyCandidates(result.qualified as any);
      const webhookStatus = await notifyDailyWebhook("MFI 과매도", () => sendUsDailyIndicatorSignals({ mfi: filtered.filtered as any }));
      return updateOriginalResponse(applicationId, interaction.token, webhookStatus.trim());
    }).catch(() => updateOriginalResponse(applicationId, interaction.token, "MFI 과매도 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "dmi") {
    void scanStoredUsDmi().then(async (result) => {
      const filtered = await filterUsDailyCandidates(result.qualified as any);
      const webhookStatus = await notifyDailyWebhook("DMI", () => sendUsDailyIndicatorSignals({ dmi: filtered.filtered as any }));
      return updateOriginalResponse(applicationId, interaction.token, webhookStatus.trim());
    }).catch(() => updateOriginalResponse(applicationId, interaction.token, "DMI 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "macd") {
    void scanStoredUsMacd().then(async (result) => {
      const filtered = await filterUsDailyCandidates(result.qualified as any);
      const webhookStatus = await notifyDailyWebhook("MACD", () => sendUsDailyIndicatorSignals({ macd: filtered.filtered as any }));
      return updateOriginalResponse(applicationId, interaction.token, webhookStatus.trim());
    }).catch(() => updateOriginalResponse(applicationId, interaction.token, "MACD 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "daily-trend") {
    void scanUsDailyTrend().then(async (result) => { const webhookStatus = await notifyDailyWebhook("일봉 급등 추세 통합", () => sendUsDailyTrendToDiscord(result.results)); return updateOriginalResponse(applicationId, interaction.token, `${formatDailyTrendResult(result)}\n\n${webhookStatus.trim()}`); }).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 급등 추세 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "daily-filter-refresh") {
    void runUsDailyFilterRefresh().then((result) => updateOriginalResponse(applicationId, interaction.token, `✅ 통합 일봉 필터 재평가 및 Webhook 전송 완료\n대상: OBV ${result.instruments.obv} · MFI ${result.instruments.mfi} · DMI ${result.instruments.dmi} · MACD ${result.instruments.macd} · 돌파 ${result.instruments.breakout}\n후보: OBV ${result.counts.obv} · MFI ${result.counts.mfi} · DMI ${result.counts.dmi} · MACD ${result.counts.macd} · 돌파 ${result.counts.breakout}`)).catch((error) => updateOriginalResponse(applicationId, interaction.token, `통합 일봉 필터 갱신 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`));
  } else if (interaction.data.name === "news") {
    void fetchTickerNews(ticker, { period: "today" as KisNewsPeriod }).then((result) => updateOriginalResponse(applicationId, interaction.token, formatNewsResult(result))).catch((error) => updateOriginalResponse(applicationId, interaction.token, `뉴스 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`));
  }
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}
