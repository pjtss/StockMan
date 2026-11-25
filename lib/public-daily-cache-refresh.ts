import { after, NextResponse } from "next/server";
import { getAutomationRunResultStatus } from "@/lib/automation-run-result-status";
import { acquireAutomationLock } from "@/lib/automation-lock";
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
    status,
    instrumentCount: numberOrNull(result.instrumentCount),
    successCount: numberOrNull(result.successCount),
    failureCount: numberOrNull(result.failureCount),
    savedCandleCount: numberOrNull(market === "KR" ? result.dailySavedCandleCount : result.savedCandleCount),
  };
}

/**
 * Public POST entry point for requesting a full market daily-cache refresh.
 * The DB lock lease is transferred to Next.js after() so the request returns
 * immediately while one server process owns the background refresh.
 */
export async function handlePublicDailyCacheRefresh(market: PublicDailyCacheMarket) {
  const moduleKey = getModuleKey(market);
  const lockKey = `public-daily-cache-refresh:${moduleKey}`;
  const lease = await acquireAutomationLock(lockKey);

  if (lease === null) {
    return NextResponse.json(
      { ok: true, market, accepted: false, skipped: true, reason: "already_running" },
      { status: 202, headers: { "cache-control": "no-store", "retry-after": "60" } },
    );
  }

  let leaseTransferredToBackground = false;
  try {
    if (!(await isDailyCandleAutomationEnabled())) {
      return NextResponse.json({ ok: false, market, error: "DAILY_CACHE_AUTOMATION_DISABLED" }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const settings = await loadFeatureModuleSettings(moduleKey);
    if (!settings.enabled) {
      return NextResponse.json({ ok: false, market, error: "DAILY_CACHE_MODULE_DISABLED" }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const latestRun = await loadLatestExecutedAutomationRun(moduleKey);
    if (latestRun?.status === "RUNNING") {
      return NextResponse.json(
        { ok: true, market, accepted: false, skipped: true, reason: "already_running" },
        { status: 202, headers: { "cache-control": "no-store", "retry-after": "60" } },
      );
    }

    const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
    const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, Math.floor((Date.now() - latestStartedAt) / 1_000));
    const intervalSeconds = Math.max(PUBLIC_REFRESH_MIN_INTERVAL_SECONDS, settings.intervalSeconds ?? PUBLIC_REFRESH_MIN_INTERVAL_SECONDS);
    if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
      const retryAfterSeconds = intervalSeconds - elapsedSeconds;
      return NextResponse.json(
        { ok: false, market, error: "DAILY_CACHE_REFRESH_COOLDOWN", retryAfterSeconds, intervalSeconds },
        { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryAfterSeconds) } },
      );
    }

    const dimensions = { triggerType: "MANUAL", market, timeframe: "D", jobType: "daily-cache" } as const;
    after(async () => {
      try {
        const result = market === "KR"
          ? await withAutomationRun(moduleKey, () => runKrDailyCacheNow({ timeframes: ["D"] }), dimensions)
          : await withAutomationRun(moduleKey, () => warmUsDailyPriceCache({ timeframes: ["D"] }), dimensions);
        const summary = summarizeResult(market, result as unknown as Record<string, unknown>);
        console.info(`[PublicDailyCacheRefresh] completed market=${market} status=${summary.status} instruments=${summary.instrumentCount ?? 0} success=${summary.successCount ?? 0} failures=${summary.failureCount ?? 0} saved=${summary.savedCandleCount ?? 0}`);
      } catch (error) {
        console.error(`[PublicDailyCacheRefresh] background job failed market=${market}:`, error instanceof Error ? error.message.slice(0, 1_000) : "unknown error");
      } finally {
        await lease.release();
      }
    });
    leaseTransferredToBackground = true;

    return NextResponse.json(
      { ok: true, market, accepted: true, status: "RUNNING", requestedAt: new Date().toISOString(), intervalSeconds, completionCheck: "GET /api/public/daily-candles" },
      { status: 202, headers: { "cache-control": "no-store", "retry-after": String(intervalSeconds) } },
    );
  } finally {
    if (!leaseTransferredToBackground) await lease.release();
  }
}
