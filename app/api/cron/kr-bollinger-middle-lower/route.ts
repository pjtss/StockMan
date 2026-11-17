import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { sendKrBollingerBandSignals } from "@/lib/discord-kr-bollinger-band";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { withDailyBollingerRetry } from "@/lib/daily-bollinger-retry";

export async function POST(request: Request) {
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("kr-bollinger-middle-lower");
  if (!debugRun && !(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("kr-bollinger-middle-lower", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("kr-bollinger-middle-lower", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, settings.cooldownSeconds ?? 0);
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("kr-bollinger-middle-lower"); }
  catch (error) { console.error("[API /cron/kr-bollinger-middle-lower] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "KR_BOLLINGER_MIDDLE_LOWER_RUNNING_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("kr-bollinger-middle-lower", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds, effectiveIntervalSeconds }); }
  let latestRun;
  try { latestRun = await loadLatestExecutedAutomationRun("kr-bollinger-middle-lower"); }
  catch (error) { console.error("[API /cron/kr-bollinger-middle-lower] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "KR_BOLLINGER_MIDDLE_LOWER_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds, effectiveIntervalSeconds }, { status: 503 }); }
  const elapsedSeconds = latestRun?.started_at ? Math.max(0, (Date.now() - new Date(latestRun.started_at).getTime()) / 1000) : null;
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("kr-bollinger-middle-lower", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  const execution = await withExclusiveAutomationRun("kr-bollinger-middle-lower", async () => {
    const scan = await withDailyBollingerRetry({ scope: "KR", zone: "MIDDLE_TO_LOWER" }, (sourceCheckedAt) => scanStoredKrBollingerBands({ moduleKey: "kr-bollinger-middle-lower", sourceCheckedAt }));
    if (scan.universeAvailable !== true || !Number.isSafeInteger(scan.instrumentCount) || scan.instrumentCount <= 0) throw new Error("KR_BOLLINGER_UNIVERSE_UNAVAILABLE");
    const cache = await persistDailyBollingerResults("KR", "MIDDLE_TO_LOWER", scan);
    const discord = cache.staleScanSkipped ? { skipped: true, reason: "stale_scan" } : await sendKrBollingerBandSignals(scan.results, "중단선~하단선", "kr-bollinger-middle-lower");
    return { ...scan, discord, cache };
  });
  if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds, effectiveIntervalSeconds });
  const result = execution.result;
  return NextResponse.json({ ...result, debugRun, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds });
}
