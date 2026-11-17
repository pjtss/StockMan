import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  const settings = await loadFeatureModuleSettings("us-daily-breakout");
  if (!settings.enabled) { await recordSkippedAutomationRun("us-daily-breakout", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("us-daily-breakout", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 60);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, Math.max(0, settings.cooldownSeconds ?? 0));
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("us-daily-breakout"); }
  catch (error) { console.error("[API /cron/us-daily-breakout] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_DAILY_BREAKOUT_RUNNING_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("us-daily-breakout", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds, effectiveIntervalSeconds }); }
  let latestRun;
  try { latestRun = await loadLatestExecutedAutomationRun("us-daily-breakout"); }
  catch (error) { console.error("[API /cron/us-daily-breakout] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_DAILY_BREAKOUT_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-daily-breakout", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  try { const execution = await withExclusiveAutomationRun("us-daily-breakout", async () => { const scan = await runUsDailyBreakoutScan(); const discord = await sendUsDailyBreakoutToDiscord(scan.qualified); return { ...scan, discord }; }); if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds }); const result = execution.result; return NextResponse.json({ intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, ...result, ok: result.ok && result.discord.ok }); }
  catch (error) { console.error("[API /cron/us-daily-breakout] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, error: "US_DAILY_BREAKOUT_FAILED" }, { status: 502 }); }
}
