import { NextResponse } from "next/server";
import { getAutomationRunResultStatus } from "@/lib/automation-run-result-status";
import { withAutomationLock } from "@/lib/automation-lock";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun } from "@/lib/automation-run-repository";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { runKrDailyCacheNow } from "@/lib/kr-daily-cache-job";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";

export type PublicDailyCacheMarket = "KR" | "US";

const PUBLIC_REFRESH_MIN_INTERVAL_SECONDS = 3_600;

function getModuleKey(market: PublicDailyCacheMarket) {
  return market === "KR" ? "kr-daily-cache" : "us-daily-cache";
}

function summarizeResult(market: PublicDailyCacheMarket, result: Record<string, unknown>) {
  const status = getAutomationRunResultStatus(result).runStatus;
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    ok: status !== "FAILED",
    market,
    status,
    startedAt: typeof result.startedAt === "string" ? result.startedAt : null,
    completedAt: typeof result.completedAt === "string" ? result.completedAt : null,
    durationMs: numberOrNull(result.durationMs),
    instrumentCount: numberOrNull(result.instrumentCount),
    successCount: numberOrNull(result.successCount),
    failureCount: numberOrNull(result.failureCount),
    savedCandleCount: numberOrNull(market === "KR" ? result.dailySavedCandleCount : result.savedCandleCount),
    coverage: Array.isArray(result.dailyCoverage) ? result.dailyCoverage : undefined,
  };
}

/**
 * Public POST entry point for requesting a full market daily-cache refresh.
 * Calls intentionally bypass the scheduler's clock window, while honoring
 * the operator enable switch, a global minimum cooldown, and a DB lock.
 */
export async function handlePublicDailyCacheRefresh(market: PublicDailyCacheMarket) {
  const moduleKey = getModuleKey(market);
  const lockKey = `public-daily-cache-refresh:${moduleKey}`;

  const execution = await withAutomationLock(lockKey, async () => {
    if (!(await isDailyCandleAutomationEnabled())) {
      return { status: 409, body: { ok: false, market, error: "DAILY_CACHE_AUTOMATION_DISABLED" } };
    }

    const settings = await loadFeatureModuleSettings(moduleKey);
    if (!settings.enabled) {
      return { status: 409, body: { ok: false, market, error: "DAILY_CACHE_MODULE_DISABLED" } };
    }

    const latestRun = await loadLatestExecutedAutomationRun(moduleKey);
    const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
    const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, Math.floor((Date.now() - latestStartedAt) / 1_000));
    const intervalSeconds = Math.max(PUBLIC_REFRESH_MIN_INTERVAL_SECONDS, settings.intervalSeconds ?? PUBLIC_REFRESH_MIN_INTERVAL_SECONDS);

    if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
      const retryAfterSeconds = intervalSeconds - elapsedSeconds;
      return {
        status: 429,
        headers: { "retry-after": String(retryAfterSeconds) },
        body: { ok: false, market, error: "DAILY_CACHE_REFRESH_COOLDOWN", retryAfterSeconds, intervalSeconds },
      };
    }

    const dimensions = { triggerType: "PUBLIC_API", market, timeframe: "D", jobType: "daily-cache" } as const;
    const result = market === "KR"
      ? await withAutomationRun(moduleKey, runKrDailyCacheNow, dimensions)
      : await withAutomationRun(moduleKey, warmUsDailyPriceCache, dimensions);

    return { status: 200, body: summarizeResult(market, result as unknown as Record<string, unknown>) };
  });

  if (execution === null) {
    return NextResponse.json(
      { ok: true, market, accepted: false, skipped: true, reason: "already_running" },
      { status: 202, headers: { "cache-control": "no-store", "retry-after": "60" } },
    );
  }

  return NextResponse.json(execution.body, {
    status: execution.status,
    headers: { "cache-control": "no-store", ...("headers" in execution ? execution.headers : {}) },
  });
}
