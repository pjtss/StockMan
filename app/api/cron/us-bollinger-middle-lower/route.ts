import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { sendUsBollingerBandSignals } from "@/lib/discord-us-bollinger-band";

export async function POST(request: Request) {
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-bollinger-middle-lower");
  if (!debugRun && !(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("us-bollinger-middle-lower", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, Math.max(0, settings.cooldownSeconds ?? 0));
  const latestRun = await loadLatestExecutedAutomationRun("us-bollinger-middle-lower").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-bollinger-middle-lower", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  const result = await withAutomationRun("us-bollinger-middle-lower", async () => {
    const scan = await scanStoredUsBollingerBands({ moduleKey: "us-bollinger-middle-lower" });
    const discord = await sendUsBollingerBandSignals(scan.results, "중단선~하단선");
    return { ...scan, discord };
  });
  return NextResponse.json({ ok: true, debugRun, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, ...result });
}
