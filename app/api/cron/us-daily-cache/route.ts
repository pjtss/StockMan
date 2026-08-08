import { NextResponse } from "next/server";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const moduleSettings = await loadFeatureModuleSettings("us-daily-cache");
  if (!moduleSettings.enabled || !isWithinSchedule(moduleSettings)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule", intervalSeconds: moduleSettings.intervalSeconds ?? 43_200, schedule: "weekdays" });
  }
  const intervalSeconds = Math.max(60, moduleSettings.intervalSeconds ?? 43_200);
  const epochSeconds = Math.floor(Date.now() / 1000);
  if (epochSeconds % intervalSeconds >= 60) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, schedule: "weekdays, every 12 hours" });
  }
  try { return NextResponse.json({ ok: true, ...(await withAutomationRun("us-daily-cache", warmUsDailyPriceCache)) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
