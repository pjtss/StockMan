import { NextResponse } from "next/server";
import { verifyDiscordSignature } from "@/lib/discord-interaction-security";
import { formatTickerOverview, getTickerOverview } from "@/lib/discord-ticker-overview";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionValue(data: any, name: string) {
  return data?.options?.find((option: any) => option?.name === name)?.value;
}

async function updateOriginalResponse(applicationId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
}

function formatBreakoutResult(result: Awaited<ReturnType<typeof runUsDailyBreakoutScan>>) {
  if (!result.qualified.length) return [`오늘 5거래일 고가 돌파 종목이 없습니다. (통합 종목 ${result.instrumentCount}개)`, "", "분석 대상", ...result.results.map((item) => `- ${item.market} ${item.code}: ${item.error || `현재가 ${item.currentPrice} / 직전 5일 최고가 ${item.previousFiveDayHigh} (미돌파)`}`)].join("\n");
  return [`🚨 **일봉 5거래일 고가 돌파 후보**`, `통합 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [
    `**${item.market} ${item.code}**`,
    `현재가 ${item.currentPrice} · 직전 5일 최고가 ${item.previousFiveDayHigh}`,
    `등락률 ${item.rate ?? "확인 불가"}% · 거래량 ${item.volume ?? "확인 불가"}`,
    `시총 ${item.marketCap ?? "확인 불가"} · 거래대금 ${item.tradingValue ?? "확인 불가"} · 시총 대비 ${item.turnoverRatio == null ? "확인 불가" : `${item.turnoverRatio.toFixed(2)}%`}`,
    `유통주 ${item.freeFloatShares ?? "확인 불가"} · 유통비율 ${item.freeFloatPercent == null ? "확인 불가" : `${item.freeFloatPercent}%`}`,
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
  return [`📊 **일봉 MACD 상승 후보**`, `기준: ${result.fast}/${result.slow}/${result.signal} · MACD > Signal`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `MACD ${item.macd.toFixed(4)} · Signal ${item.signal.toFixed(4)} · Histogram ${item.histogram.toFixed(4)}`, item.goldenCross ? "🟢 골든크로스" : "상승 모멘텀 유지"].join("\n"))].join("\n\n");
}
function formatDailyObvResult(result: Awaited<ReturnType<typeof scanStoredUsDailyObv>>) {
  if (!result.qualified.length) return [`일봉 OBV 상승 종목이 없습니다.`, `기준: 최근 ${result.lookback}거래일 · 분석 ${result.instrumentCount}개 · 성공 ${result.successCount}개 · 실패 ${result.failureCount}개`].join("\n");
  return [`📊 **일봉 OBV 상승 후보**`, `기준: 최근 ${result.lookback}거래일 OBV 비교`, `분석 종목 ${result.instrumentCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [`**${item.market} ${item.code}**${item.name ? ` | ${item.name}` : ""}`, `OBV 변화 ${item.change} · 최근 OBV ${item.recentObv} · 상승 바 비율 ${(item.risingBarRate * 100).toFixed(1)}%`, `종가 ${item.lastClose} · 기준일 ${item.date}`].join("\n"))].join("\n\n");
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) return new NextResponse("invalid request signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (interaction.type !== 2 || !["ticker", "daily-breakout", "daily-obv", "mfi-oversold", "dmi", "macd"].includes(interaction.data?.name)) return NextResponse.json({ type: 4, data: { content: "지원하지 않는 명령어입니다.", flags: 64 } });
  const ticker = String(optionValue(interaction.data, "symbol") || "").trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID || interaction.application_id;
  if (interaction.data.name === "daily-breakout") {
    void runUsDailyBreakoutScan().then((result) => updateOriginalResponse(applicationId, interaction.token, formatBreakoutResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 돌파 후보를 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "daily-obv") {
    void scanStoredUsDailyObv().then((result) => updateOriginalResponse(applicationId, interaction.token, formatDailyObvResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 OBV 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "mfi-oversold") {
    void scanStoredUsMfiOversold().then((result) => updateOriginalResponse(applicationId, interaction.token, formatMfiResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "MFI 과매도 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "dmi") {
    void scanStoredUsDmi().then((result) => updateOriginalResponse(applicationId, interaction.token, formatDmiResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "DMI 종목을 조회하는 중 오류가 발생했습니다."));
  } else if (interaction.data.name === "macd") {
    void scanStoredUsMacd().then((result) => updateOriginalResponse(applicationId, interaction.token, formatMacdResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "MACD 종목을 조회하는 중 오류가 발생했습니다."));
  } else {
    void getTickerOverview(ticker).then((overview) => updateOriginalResponse(applicationId, interaction.token, formatTickerOverview(overview))).catch(() => updateOriginalResponse(applicationId, interaction.token, "티커 정보를 조회하는 중 오류가 발생했습니다."));
  }
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}
