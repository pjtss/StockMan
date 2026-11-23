import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { acquireAutomationLock } from "@/lib/automation-lock";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  let lease: Awaited<ReturnType<typeof acquireAutomationLock>> = null;
  try {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  lease = await acquireAutomationLock("public-daily-cache-refresh:us-daily-cache");
  if (lease === null) return NextResponse.json({ ok: true, skipped: true, reason: "already_running" }, { status: 202, headers: { "retry-after": "60" } });
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  const moduleSettings = await loadFeatureModuleSettings("us-daily-cache");
  if (!moduleSettings.enabled || !isWithinSchedule(moduleSettings)) {
    await recordSkippedAutomationRun("us-daily-cache", moduleSettings.enabled ? "outside_schedule" : "disabled");
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule", intervalSeconds: moduleSettings.intervalSeconds ?? 3_600, schedule: "DB schedule, hourly" });
  }
  const intervalSeconds = Math.max(60, moduleSettings.intervalSeconds ?? 3_600);
  let latest;
  try {
    latest = await loadLatestExecutedAutomationRun("us-daily-cache");
  } catch (error) {
    console.error("[API /cron/us-daily-cache] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_DAILY_CACHE_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds }, { status: 503 });
  }
  const latestStartedAt = latest?.started_at ? new Date(latest.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    await recordSkippedAutomationRun("us-daily-cache", "outside_interval", { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), schedule: "DB schedule, hourly" });
  }
  return NextResponse.json(await withAutomationRun("us-daily-cache", warmUsDailyPriceCache));
  } catch (error) { console.error("[API /cron/us-daily-cache] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "us-daily-cache-cron", error: "US_DAILY_CACHE_FAILED" }, { status: 502 }); }
  finally { await lease?.release(); }
}
