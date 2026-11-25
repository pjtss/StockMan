import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { acquireAutomationLock } from "@/lib/automation-lock";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { runKrDailyCacheNow } from "@/lib/kr-daily-cache-job";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { notifyDailyCacheRefreshIssue } from "@/lib/automation-completion-discord";

export async function POST(request: Request) {
  let lease: Awaited<ReturnType<typeof acquireAutomationLock>> = null;
  try {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  lease = await acquireAutomationLock("public-daily-cache-refresh:kr-daily-cache");
  if (lease === null) return NextResponse.json({ ok: true, skipped: true, reason: "already_running" }, { status: 202, headers: { "retry-after": "60" } });
  const settings = await loadFeatureModuleSettings("kr-daily-cache");
  const evaluatedAt = new Date();
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 3_600);
  const schedule = { timezone: "Asia/Seoul", evaluatedAtKst: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(evaluatedAt).replace(" ", "T") + "+09:00", enabled: settings.enabled, scheduleMode: settings.scheduleMode ?? "daily-window", startTime: settings.startTime, endTime: settings.endTime, activeDays: settings.activeDays, startDay: settings.startDay ?? null, endDay: settings.endDay ?? null, intervalSeconds };
  if (!(await isDailyCandleAutomationEnabled())) { await recordSkippedAutomationRun("kr-daily-cache", "daily_automation_disabled", { schedule }); return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled", schedule }); }
  if (!settings.enabled) { await recordSkippedAutomationRun("kr-daily-cache", "disabled", { schedule }); return NextResponse.json({ ok: true, skipped: true, reason: "disabled", schedule }); }
  if (!isWithinSchedule(settings, evaluatedAt)) { await recordSkippedAutomationRun("kr-daily-cache", "outside_schedule", { schedule }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", schedule }); }
  let latestRun;
  try {
    latestRun = await loadLatestExecutedAutomationRun("kr-daily-cache");
  } catch (error) {
    console.error("[API /cron/kr-daily-cache] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, stage: "interval-gate", error: "KR_DAILY_CACHE_INTERVAL_CHECK_UNAVAILABLE", schedule }, { status: 503 });
  }
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("kr-daily-cache", reason, { schedule, intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, schedule, intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  const result = await withAutomationRun("kr-daily-cache", runKrDailyCacheNow);
  return NextResponse.json({ ok: true, intervalSeconds, ...result });
  } catch (error) { console.error("[API /cron/kr-daily-cache] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); await notifyDailyCacheRefreshIssue("KR", "cron-handler", "KR_DAILY_CACHE_FAILED").catch(() => undefined); return NextResponse.json({ ok: false, stage: "kr-daily-cache-cron", error: "KR_DAILY_CACHE_FAILED" }, { status: 502 }); }
  finally { await lease?.release(); }
}
