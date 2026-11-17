import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { scanUsMinuteBollingerBands } from "@/lib/us-minute-bollinger-band";
import { sendUsMinuteBollingerBandSignals } from "@/lib/discord-us-minute-bollinger-band";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-minute-bollinger-band");
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 60);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, settings.cooldownSeconds ?? 0);
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("us-minute-bollinger-band"); }
  catch (error) { console.error("[API /cron/us-minute-bollinger-band] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_MINUTE_BOLLINGER_BAND_RUNNING_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("us-minute-bollinger-band", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds, effectiveIntervalSeconds }); }
  let latestRun;
  try { latestRun = await loadLatestExecutedAutomationRun("us-minute-bollinger-band"); }
  catch (error) { console.error("[API /cron/us-minute-bollinger-band] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_MINUTE_BOLLINGER_BAND_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-minute-bollinger-band", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  try { const execution = await withExclusiveAutomationRun("us-minute-bollinger-band", async () => { const scan = await scanUsMinuteBollingerBands(); if (!scan.ok) return { ...scan, discord: { ok: false, skipped: true, reason: "INCOMPLETE_SCAN" } }; const discord = await sendUsMinuteBollingerBandSignals(scan.results); return { ...scan, discord }; }); if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds, cooldownSeconds: settings.cooldownSeconds }); return NextResponse.json({ intervalSeconds, cooldownSeconds: settings.cooldownSeconds, ...execution.result }); } catch (error) { console.error("[API /cron/us-minute-bollinger-band] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, intervalSeconds, error: "US_MINUTE_BOLLINGER_BAND_FAILED" }, { status: 502 }); }
}
