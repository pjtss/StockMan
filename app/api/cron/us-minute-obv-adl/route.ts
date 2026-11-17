import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { scanUsMinuteObvAdl } from "@/lib/us-minute-obv-adl";
import { sendUsMinuteObvAdlSignals } from "@/lib/discord-us-minute-obv-adl";
import { readKisCache } from "@/lib/kis-cache";
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-minute-obv-adl"); if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const interval = Math.max(60, settings.intervalSeconds ?? 60);
  let activeRun;
  try { activeRun = await loadRunningAutomationRun("us-minute-obv-adl"); }
  catch (error) { console.error("[API /cron/us-minute-obv-adl] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_MINUTE_OBV_ADL_RUNNING_CHECK_UNAVAILABLE", intervalSeconds: interval }, { status: 503 }); }
  if (activeRun) { await recordSkippedAutomationRun("us-minute-obv-adl", "already_running", { runningRunId: activeRun.id, runningStartedAt: activeRun.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: activeRun.id, intervalSeconds: interval }); }
  let latest;
  try { latest = await loadLatestExecutedAutomationRun("us-minute-obv-adl"); }
  catch (error) { console.error("[API /cron/us-minute-obv-adl] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_MINUTE_OBV_ADL_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds: interval }, { status: 503 }); }
  const elapsed = latest?.started_at ? (Date.now() - new Date(latest.started_at).getTime()) / 1000 : null;
  if (elapsed != null && elapsed < interval) { await recordSkippedAutomationRun("us-minute-obv-adl", "outside_interval", { elapsedSeconds: Math.round(elapsed), intervalSeconds: interval }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", elapsedSeconds: Math.round(elapsed), intervalSeconds: interval }); }
  try { const execution = await withExclusiveAutomationRun("us-minute-obv-adl", async () => { const previous = await readKisCache<{ qualified?: Array<{ market: string; code: string }> }>("minute-obv-adl:US:1m"); const previousKeys = new Set((previous?.qualified ?? []).map((item) => `${item.market}:${item.code}`)); const scan = await scanUsMinuteObvAdl(); if (!scan.ok) return { ...scan, newlyQualified: [], previousQualifiedCount: previousKeys.size, discord: { ok: false, skipped: true, reason: "INCOMPLETE_SCAN" } }; const newlyQualified = scan.qualified.filter((item) => !previousKeys.has(`${item.market}:${item.code}`)); const discord = await sendUsMinuteObvAdlSignals(newlyQualified); return { ...scan, newlyQualified, previousQualifiedCount: previousKeys.size, discord }; }); if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds: interval }); return NextResponse.json(execution.result); } catch (error) { console.error("[API /cron/us-minute-obv-adl] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, error: "US_MINUTE_OBV_ADL_FAILED" }, { status: 502 }); }
}
