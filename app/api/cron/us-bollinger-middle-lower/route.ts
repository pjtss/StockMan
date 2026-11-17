import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { sendUsBollingerBandSignals } from "@/lib/discord-us-bollinger-band";
import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { withDailyBollingerRetry } from "@/lib/daily-bollinger-retry";

export async function POST(request: Request) {
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-bollinger-middle-lower");
  if (!debugRun && !(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("us-bollinger-middle-lower", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, Math.max(0, settings.cooldownSeconds ?? 0));
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("us-bollinger-middle-lower"); }
  catch (error) { console.error("[API /cron/us-bollinger-middle-lower] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_BOLLINGER_MIDDLE_LOWER_RUNNING_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("us-bollinger-middle-lower", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds, effectiveIntervalSeconds }); }
  let latestRun;
  try { latestRun = await loadLatestExecutedAutomationRun("us-bollinger-middle-lower"); }
  catch (error) { console.error("[API /cron/us-bollinger-middle-lower] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_BOLLINGER_MIDDLE_LOWER_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-bollinger-middle-lower", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  const execution = await withExclusiveAutomationRun("us-bollinger-middle-lower", async () => {
    const scan = await withDailyBollingerRetry({ scope: "US", zone: "MIDDLE_TO_LOWER" }, (sourceCheckedAt) => scanStoredUsBollingerBands({ moduleKey: "us-bollinger-middle-lower", sourceCheckedAt }));
    if (scan.ok === false || scan.universeAvailable === false || !Number.isSafeInteger(scan.instrumentCount) || scan.instrumentCount <= 0) throw new Error("US_BOLLINGER_UNIVERSE_UNAVAILABLE");
    const cache = await persistDailyBollingerResults("US", "MIDDLE_TO_LOWER", scan);
    const discord = cache.staleScanSkipped ? { skipped: true, reason: "stale_scan" } : await sendUsBollingerBandSignals(scan.results, "중단선~하단선");
    return { ...scan, discord, cache };
  });
  if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds });
  const result = execution.result;
  return NextResponse.json({ debugRun, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, ...result });
}
