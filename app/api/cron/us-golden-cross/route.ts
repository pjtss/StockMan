import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { calculateGoldenCross, persistGoldenCrossResults, type GoldenCrossResult } from "@/lib/daily-golden-cross";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-golden-cross");
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  let running;
  try { running = await loadRunningAutomationRun("us-golden-cross"); }
  catch (error) { console.error("[API /cron/us-golden-cross] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "US_GOLDEN_CROSS_RUNNING_CHECK_UNAVAILABLE" }, { status: 503 }); }
  if (running) { await recordSkippedAutomationRun("us-golden-cross", "already_running", { runningRunId: running.id, runningStartedAt: running.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: running.id }); }
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("us-golden-cross", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings)) { await recordSkippedAutomationRun("us-golden-cross", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(3600, settings.intervalSeconds ?? 86400);
  let latest;
  try { latest = await loadLatestExecutedAutomationRun("us-golden-cross"); }
  catch (error) { console.error("[API /cron/us-golden-cross] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "US_GOLDEN_CROSS_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds }, { status: 503 }); }
  const elapsedSeconds = latest?.started_at ? Math.round((Date.now() - new Date(latest.started_at).getTime()) / 1000) : null;
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < intervalSeconds) { await recordSkippedAutomationRun("us-golden-cross", "outside_interval", { intervalSeconds, elapsedSeconds }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds }); }
  const execution = await withExclusiveAutomationRun("us-golden-cross", async () => {
    const context = await createUsDailyScanContext({ candleLimit: 30, timeframe: "D" });
    if (context.universe.universe.ok !== true || context.universe.scopes.length === 0) throw new Error("US_GOLDEN_CROSS_UNIVERSE_UNAVAILABLE");
    const policy = (settings.featureSettings?.goldenCrossPolicy ?? {}) as any;
    const results: GoldenCrossResult[] = context.universe.scopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross(context.candles.get(`${scope.market}:${scope.code}`) ?? [], policy) }));
    if (results.length === 0) throw new Error("US_GOLDEN_CROSS_EMPTY_RESULTS");
    const cache = await persistGoldenCrossResults("US", results);
    return { ok: true, instrumentCount: results.length, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, qualified: results.filter((row) => row.qualifies), cache };
  });
  if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds });
  const result = execution.result;
  return NextResponse.json({ intervalSeconds, debugRun, ...result });
}
