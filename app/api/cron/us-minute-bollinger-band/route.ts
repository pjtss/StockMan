import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationRun } from "@/lib/automation-run";
import { scanUsMinuteBollingerBands } from "@/lib/us-minute-bollinger-band";
import { sendUsMinuteBollingerBandSignals } from "@/lib/discord-us-minute-bollinger-band";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-minute-bollinger-band");
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 60);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, settings.cooldownSeconds ?? 0);
  const latestRun = await loadLatestExecutedAutomationRun("us-minute-bollinger-band").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-minute-bollinger-band", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  try { return NextResponse.json({ intervalSeconds, cooldownSeconds: settings.cooldownSeconds, ...(await withAutomationRun("us-minute-bollinger-band", async () => { const scan = await scanUsMinuteBollingerBands(); const discord = await sendUsMinuteBollingerBandSignals(scan.results); return { ...scan, discord }; })) }); } catch (error) { console.error("[API /cron/us-minute-bollinger-band] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error"); return NextResponse.json({ ok: false, intervalSeconds, error: "US_MINUTE_BOLLINGER_BAND_FAILED" }, { status: 502 }); }
}
