import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runUsDailyBreakoutScan()), discordMode: "PREVIEW" }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}

export async function POST() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runUsDailyBreakoutScan();
    const { sendUsDailyBreakoutToDiscord } = await import("@/lib/discord-us-daily-breakout");
    const discord = await sendUsDailyBreakoutToDiscord(result.qualified);
    return NextResponse.json({ ok: discord.ok, ...result, discord });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}

