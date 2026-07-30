import { NextResponse } from "next/server";
import { verifyDiscordSignature } from "@/lib/discord-interaction-security";
import { formatTickerOverview, getTickerOverview } from "@/lib/discord-ticker-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionValue(data: any, name: string) {
  return data?.options?.find((option: any) => option?.name === name)?.value;
}

async function updateOriginalResponse(applicationId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) return new NextResponse("invalid request signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (interaction.type !== 2 || interaction.data?.name !== "ticker") return NextResponse.json({ type: 4, data: { content: "지원하지 않는 명령어입니다.", flags: 64 } });
  const ticker = String(optionValue(interaction.data, "symbol") || "").trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID || interaction.application_id;
  void getTickerOverview(ticker).then((overview) => updateOriginalResponse(applicationId, interaction.token, formatTickerOverview(overview))).catch(() => updateOriginalResponse(applicationId, interaction.token, "티커 정보를 조회하는 중 오류가 발생했습니다."));
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}
