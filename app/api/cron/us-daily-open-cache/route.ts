import { NextResponse } from "next/server";
import { refreshUsDailyOpenCache } from "@/lib/us-daily-open-cache";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-daily-open-cache");
  if (!settings.enabled) {
    await recordSkippedAutomationRun("us-daily-open-cache", "disabled");
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled", intervalSeconds: settings.intervalSeconds ?? 3600 });
  }
  if (!isWithinSchedule(settings, new Date())) {
    await recordSkippedAutomationRun("us-daily-open-cache", "outside_schedule");
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", intervalSeconds: settings.intervalSeconds ?? 3600 });
  }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 3600);
  const latestRun = await loadLatestExecutedAutomationRun("us-daily-open-cache").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-daily-open-cache", reason, { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  try {
    const result = await withAutomationRun("us-daily-open-cache", refreshUsDailyOpenCache);
    return NextResponse.json({ ok: true, intervalSeconds, ...result });
  } catch (error) {
    console.error("[API /cron/us-daily-open-cache] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, intervalSeconds, error: "US_DAILY_OPEN_CACHE_FAILED" }, { status: 502 });
  }
}
