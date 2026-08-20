import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { calculateGoldenCross, persistGoldenCrossResults, type GoldenCrossResult } from "@/lib/daily-golden-cross";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("kr-golden-cross");
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  const running = await loadRunningAutomationRun("kr-golden-cross").catch(() => null);
  if (running) { await recordSkippedAutomationRun("kr-golden-cross", "already_running", { runningRunId: running.id, runningStartedAt: running.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: running.id }); }
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("kr-golden-cross", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings)) { await recordSkippedAutomationRun("kr-golden-cross", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(3600, settings.intervalSeconds ?? 86400);
  const latest = await loadLatestExecutedAutomationRun("kr-golden-cross").catch(() => null);
  const elapsedSeconds = latest?.started_at ? Math.round((Date.now() - new Date(latest.started_at).getTime()) / 1000) : null;
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < intervalSeconds) { await recordSkippedAutomationRun("kr-golden-cross", "outside_interval", { intervalSeconds, elapsedSeconds }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds }); }
  const result = await withAutomationRun("kr-golden-cross", async () => {
    const universe = await loadStoredKrInstrumentScopes();
    const candles = await loadCachedKrDailyCandlesBulk(universe.scopes, 30, "D");
    const policy = (settings.featureSettings?.goldenCrossPolicy ?? {}) as any;
    const results: GoldenCrossResult[] = universe.scopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross(candles.get(`${scope.market}:${scope.code}`) ?? [], policy) }));
    const cache = await persistGoldenCrossResults("KR", results);
    return { ok: true, instrumentCount: results.length, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, qualified: results.filter((row) => row.qualifies), cache };
  });
  return NextResponse.json({ intervalSeconds, debugRun, ...result });
}
