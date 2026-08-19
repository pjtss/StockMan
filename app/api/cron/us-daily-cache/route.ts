import { NextResponse } from "next/server";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const moduleSettings = await loadFeatureModuleSettings("us-daily-cache");
  if (!moduleSettings.enabled || !isWithinSchedule(moduleSettings)) {
    await recordSkippedAutomationRun("us-daily-cache", moduleSettings.enabled ? "outside_schedule" : "disabled");
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule", intervalSeconds: moduleSettings.intervalSeconds ?? 21_600, schedule: "DB schedule, six-hour minimum" });
  }
  const intervalSeconds = Math.max(60, moduleSettings.intervalSeconds ?? 21_600);
  const latest = await loadLatestExecutedAutomationRun("us-daily-cache").catch(() => null);
  const latestStartedAt = latest?.started_at ? new Date(latest.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    await recordSkippedAutomationRun("us-daily-cache", "outside_interval", { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), schedule: "DB schedule, six-hour minimum" });
  }
  try { return NextResponse.json({ ok: true, ...(await withAutomationRun("us-daily-cache", warmUsDailyPriceCache)) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
