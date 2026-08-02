import { NextResponse } from "next/server";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  if (day === 0 || day === 6 || hour !== 9 || minute !== 1) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", schedule: "weekdays 09:01 KST" });
  try { const result = await runUsDailyBreakoutScan(); const discord = await sendUsDailyBreakoutToDiscord(result.qualified); return NextResponse.json({ ok: discord.ok, ...result, discord }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
