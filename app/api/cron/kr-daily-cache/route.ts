import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { runKrDailyCacheNow } from "@/lib/kr-daily-cache-job";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";

export async function POST(request: Request) {
  try {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("kr-daily-cache");
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!settings.enabled) { await recordSkippedAutomationRun("kr-daily-cache", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("kr-daily-cache", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 21_600);
  const latestRun = await loadLatestExecutedAutomationRun("kr-daily-cache").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("kr-daily-cache", reason, { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  const result = await withAutomationRun("kr-daily-cache", runKrDailyCacheNow);
  return NextResponse.json({ ok: true, intervalSeconds, ...result });
  } catch (error) { return NextResponse.json({ ok: false, stage: "kr-daily-cache-cron", error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
