import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { refreshInstrumentFundamentals } from "@/lib/instrument-fundamentals";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, loadLatestInstrumentFundamentalBackoffSkip, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
export const runtime = "nodejs";
const MAX_FUNDAMENTALS_RUNNING_SECONDS = 5 * 60 * 60;
const MAX_BACKOFF_SCOPE_RECHECK_SECONDS = 60 * 60;
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("instrument-fundamentals");
  if (!settings.enabled || !isWithinSchedule(settings)) {
    await recordSkippedAutomationRun("instrument-fundamentals", settings.enabled ? "outside_schedule" : "disabled");
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule" });
  }
  const intervalSeconds = Math.max(3600, settings.intervalSeconds ?? 86400);
  const latest = await loadLatestExecutedAutomationRun("instrument-fundamentals");
  const latestStatus = String(latest?.status ?? "").toUpperCase();
  const latestStartedAt = latest?.started_at ? new Date(latest.started_at).getTime() : Number.NaN;
  if (latest && !Number.isFinite(latestStartedAt)) return NextResponse.json({ ok: false, error: "INVALID_LAST_RUN_TIMESTAMP" }, { status: 503 });
  const elapsed = latest ? Math.max(0, Math.round((Date.now() - latestStartedAt) / 1000)) : null;
  if (latestStatus === "RUNNING" && elapsed! < MAX_FUNDAMENTALS_RUNNING_SECONDS) {
    await recordSkippedAutomationRun("instrument-fundamentals", "already_running", { elapsedSeconds: elapsed });
    return NextResponse.json({ ok: true, skipped: true, reason: "already_running", elapsedSeconds: elapsed });
  }
  const retryIntervalSeconds = latestStatus === "SUCCESS" ? intervalSeconds : Math.min(intervalSeconds, 3600);
  if (elapsed != null && elapsed < retryIntervalSeconds) {
    await recordSkippedAutomationRun("instrument-fundamentals", latestStatus === "SUCCESS" ? "outside_interval" : "retry_cooldown", { intervalSeconds: retryIntervalSeconds, elapsedSeconds: elapsed, lastStatus: latestStatus });
    return NextResponse.json({ ok: true, skipped: true, reason: latestStatus === "SUCCESS" ? "outside_interval" : "retry_cooldown", intervalSeconds: retryIntervalSeconds, elapsedSeconds: elapsed, lastStatus: latestStatus });
  }
  const latestBackoffSkip = await loadLatestInstrumentFundamentalBackoffSkip().catch(() => null);
  if (latestBackoffSkip) {
    const backoffSkipStartedAt = new Date(latestBackoffSkip.started_at).getTime();
    const nextRetryAt = new Date(latestBackoffSkip.next_retry_at).getTime();
    const latestExecutionIsOlder = !Number.isFinite(latestStartedAt) || backoffSkipStartedAt >= latestStartedAt;
    if (Number.isFinite(backoffSkipStartedAt) && Number.isFinite(nextRetryAt) && latestExecutionIsOlder && Date.now() < nextRetryAt) {
      const recheckAt = Math.min(nextRetryAt, backoffSkipStartedAt + MAX_BACKOFF_SCOPE_RECHECK_SECONDS * 1000);
      if (Date.now() < recheckAt) {
        const retryAfterSeconds = Math.max(1, Math.ceil((recheckAt - Date.now()) / 1000));
        const nextRetryAtIso = new Date(nextRetryAt).toISOString();
        await recordSkippedAutomationRun("instrument-fundamentals", "instrument_retry_backoff_cooldown", { nextRetryAt: nextRetryAtIso, retryAfterSeconds });
        return NextResponse.json({ ok: true, skipped: true, reason: "instrument_retry_backoff_cooldown", nextRetryAt: nextRetryAtIso, retryAfterSeconds });
      }
    }
  }
  const result = await withAutomationRun("instrument-fundamentals", refreshInstrumentFundamentals);
  return NextResponse.json(result);
}
