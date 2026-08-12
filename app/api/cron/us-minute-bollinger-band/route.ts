import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationRun } from "@/lib/automation-run";
import { scanUsMinuteBollingerBands } from "@/lib/us-minute-bollinger-band";
import { sendUsMinuteBollingerBandSignals } from "@/lib/discord-us-minute-bollinger-band";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-minute-bollinger-band");
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  try { return NextResponse.json(await withAutomationRun("us-minute-bollinger-band", async () => { const scan = await scanUsMinuteBollingerBands(); const discord = await sendUsMinuteBollingerBandSignals(scan.results); return { ...scan, discord }; })); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
