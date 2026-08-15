import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { sendUsBollingerBandSignals } from "@/lib/discord-us-bollinger-band";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-bollinger-band");
  if (!(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!settings.enabled) { await recordSkippedAutomationRun("us-bollinger-band", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("us-bollinger-band", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, Math.max(0, settings.cooldownSeconds ?? 0));
  const latestRun = await loadLatestExecutedAutomationRun("us-bollinger-band").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-bollinger-band", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  try {
    const result = await withAutomationRun("us-bollinger-band", async () => {
      const scan = await scanStoredUsBollingerBands();
      const discord = await sendUsBollingerBandSignals(scan.results);
      return { ...scan, discord };
    });
    return NextResponse.json({ intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, intervalSeconds, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
