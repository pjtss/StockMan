import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { refreshUsDailyOpenCache } from "@/lib/us-daily-open-cache";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  const settings = await loadFeatureModuleSettings("us-daily-open-cache");
  if (!settings.enabled) {
    await recordSkippedAutomationRun("us-daily-open-cache", "disabled");
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled", intervalSeconds: settings.intervalSeconds ?? 3600 });
  }
  if (!isWithinSchedule(settings, new Date())) {
    await recordSkippedAutomationRun("us-daily-open-cache", "outside_schedule");
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", intervalSeconds: settings.intervalSeconds ?? 3600 });
  }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 3600);
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("us-daily-open-cache"); }
  catch (error) { console.error("[API /cron/us-daily-open-cache] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_DAILY_OPEN_CACHE_RUNNING_CHECK_UNAVAILABLE", intervalSeconds }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("us-daily-open-cache", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds }); }
  let latestRun;
  try { latestRun = await loadLatestExecutedAutomationRun("us-daily-open-cache"); }
  catch (error) { console.error("[API /cron/us-daily-open-cache] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_DAILY_OPEN_CACHE_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds }, { status: 503 }); }
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-daily-open-cache", reason, { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  try {
    const execution = await withExclusiveAutomationRun("us-daily-open-cache", refreshUsDailyOpenCache);
    if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds });
    const result = execution.result;
    return NextResponse.json({ intervalSeconds, ...result });
  } catch (error) {
    console.error("[API /cron/us-daily-open-cache] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, intervalSeconds, error: "US_DAILY_OPEN_CACHE_FAILED" }, { status: 502 });
  }
}
