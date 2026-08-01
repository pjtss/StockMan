import { NextResponse } from "next/server";
import { verifyDiscordSignature } from "@/lib/discord-interaction-security";
import { formatTickerOverview, getTickerOverview } from "@/lib/discord-ticker-overview";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionValue(data: any, name: string) {
  return data?.options?.find((option: any) => option?.name === name)?.value;
}

async function updateOriginalResponse(applicationId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
}

function formatBreakoutResult(result: Awaited<ReturnType<typeof runUsDailyBreakoutScan>>) {
  if (!result.qualified.length) return `오늘 5거래일 고가 돌파 종목이 없습니다. (관심종목 ${result.watchlistCount}개)`;
  return [`🚨 **일봉 5거래일 고가 돌파 후보**`, `관심종목 ${result.watchlistCount}개 · 조건 충족 ${result.qualified.length}개`, "", ...result.qualified.map((item) => [
    `**${item.market} ${item.code}**`,
    `현재가 ${item.currentPrice} · 직전 5일 최고가 ${item.previousFiveDayHigh}`,
    `등락률 ${item.rate ?? "확인 불가"}% · 거래량 ${item.volume ?? "확인 불가"}`,
    `시총 ${item.marketCap ?? "확인 불가"} · 거래대금 ${item.tradingValue ?? "확인 불가"} · 시총 대비 ${item.turnoverRatio == null ? "확인 불가" : `${item.turnoverRatio.toFixed(2)}%`}`,
    `유통주 ${item.freeFloatShares ?? "확인 불가"} · 유통비율 ${item.freeFloatPercent == null ? "확인 불가" : `${item.freeFloatPercent}%`}`,
  ].join("\n"))].join("\n\n");
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) return new NextResponse("invalid request signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (interaction.type !== 2 || !["ticker", "daily-breakout"].includes(interaction.data?.name)) return NextResponse.json({ type: 4, data: { content: "지원하지 않는 명령어입니다.", flags: 64 } });
  const ticker = String(optionValue(interaction.data, "symbol") || "").trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID || interaction.application_id;
  if (interaction.data.name === "daily-breakout") {
    void runUsDailyBreakoutScan().then((result) => updateOriginalResponse(applicationId, interaction.token, formatBreakoutResult(result))).catch(() => updateOriginalResponse(applicationId, interaction.token, "일봉 돌파 후보를 조회하는 중 오류가 발생했습니다."));
  } else {
    void getTickerOverview(ticker).then((overview) => updateOriginalResponse(applicationId, interaction.token, formatTickerOverview(overview))).catch(() => updateOriginalResponse(applicationId, interaction.token, "티커 정보를 조회하는 중 오류가 발생했습니다."));
  }
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}
