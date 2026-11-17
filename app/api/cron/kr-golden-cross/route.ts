import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { withExclusiveAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadRunningAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { calculateGoldenCross, persistGoldenCrossResults, type GoldenCrossResult } from "@/lib/daily-golden-cross";
import { KR_MARKET_CAP_MAX_AGE_HOURS, loadKrMarketCapSnapshots, meetsKrMarketCapFloorKrw } from "@/lib/kr-market-cap";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("kr-golden-cross");
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  let running;
  try { running = await loadRunningAutomationRun("kr-golden-cross"); }
  catch (error) { console.error("[API /cron/kr-golden-cross] running gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "running-gate", error: "KR_GOLDEN_CROSS_RUNNING_CHECK_UNAVAILABLE" }, { status: 503 }); }
  if (running) { await recordSkippedAutomationRun("kr-golden-cross", "already_running", { runningRunId: running.id, runningStartedAt: running.started_at }); return NextResponse.json({ ok: true, skipped: true, reason: "already_running", runningRunId: running.id }); }
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("kr-golden-cross", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings)) { await recordSkippedAutomationRun("kr-golden-cross", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(3600, settings.intervalSeconds ?? 86400);
  let latest;
  try { latest = await loadLatestExecutedAutomationRun("kr-golden-cross"); }
  catch (error) { console.error("[API /cron/kr-golden-cross] interval gate history unavailable:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, stage: "interval-gate", error: "KR_GOLDEN_CROSS_INTERVAL_CHECK_UNAVAILABLE", intervalSeconds }, { status: 503 }); }
  const elapsedSeconds = latest?.started_at ? Math.round((Date.now() - new Date(latest.started_at).getTime()) / 1000) : null;
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < intervalSeconds) { await recordSkippedAutomationRun("kr-golden-cross", "outside_interval", { intervalSeconds, elapsedSeconds }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds }); }
  const execution = await withExclusiveAutomationRun("kr-golden-cross", async () => {
    const universe = await loadStoredKrInstrumentScopes();
    if (!Array.isArray(universe.scopes) || universe.scopes.length === 0) throw new Error("KR_GOLDEN_CROSS_UNIVERSE_UNAVAILABLE");
    const marketCaps = await loadKrMarketCapSnapshots(universe.scopes);
    const eligibleScopes = universe.scopes.filter((item) => meetsKrMarketCapFloorKrw(marketCaps.get(`${item.market}:${item.code}`) ?? null));
    const candles = await loadCachedKrDailyCandlesBulk(eligibleScopes, 30, "D");
    const policy = (settings.featureSettings?.goldenCrossPolicy ?? {}) as any;
    const results: GoldenCrossResult[] = eligibleScopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, timeframe: "D", ...calculateGoldenCross((candles.get(`${scope.market}:${scope.code}`) ?? []).map((candle) => ({ ...candle, updatedAt: candle.fetchedAt ?? null })), policy) }));
    const cache = await persistGoldenCrossResults("KR", results, { allowEmpty: true });
    return { ok: true, instrumentCount: results.length, marketCapExcludedCount: universe.scopes.length - eligibleScopes.length, marketCapFilter: { minimumKrwExclusive: 30_000_000_000, maxSnapshotAgeHours: KR_MARKET_CAP_MAX_AGE_HOURS, unknownOrStale: "excluded" }, successCount: results.filter((row) => row.reason !== "INSUFFICIENT_HISTORY").length, failureCount: results.filter((row) => row.reason === "INSUFFICIENT_HISTORY").length, qualified: results.filter((row) => row.qualifies), cache };
  });
  if (!execution.acquired) return NextResponse.json({ ok: true, skipped: true, reason: "already_running", intervalSeconds });
  const result = execution.result;
  return NextResponse.json({ intervalSeconds, debugRun, ...result });
}
