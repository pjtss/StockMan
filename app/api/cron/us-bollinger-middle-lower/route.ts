import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { sendUsBollingerBandSignals } from "@/lib/discord-us-bollinger-band";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-bollinger-middle-lower");
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const result = await withAutomationRun("us-bollinger-middle-lower", async () => {
    const scan = await scanStoredUsBollingerBands({ moduleKey: "us-bollinger-middle-lower" });
    const discord = await sendUsBollingerBandSignals(scan.results, "중단선~하단선");
    return { ...scan, discord };
  });
  return NextResponse.json({ ok: true, intervalSeconds, ...result });
}
