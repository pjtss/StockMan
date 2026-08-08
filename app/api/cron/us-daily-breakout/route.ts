import { NextResponse } from "next/server";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-daily-breakout");
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  try { const result = await withAutomationRun("us-daily-breakout", async () => { const scan = await runUsDailyBreakoutScan(); const discord = await sendUsDailyBreakoutToDiscord(scan.qualified); return { ...scan, discord }; }); return NextResponse.json({ ok: result.discord.ok, ...result }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
