import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { sendKrBollingerBandSignals } from "@/lib/discord-kr-bollinger-band";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";
import { withDailyBollingerRetry } from "@/lib/daily-bollinger-retry";

export async function POST(request: Request) {
  const debugRun = new URL(request.url).searchParams.get("debug") === "true" || request.headers.get("x-debug-run") === "true";
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("kr-bollinger-middle-lower");
  if (!debugRun && !(await isDailyCandleAutomationEnabled())) return NextResponse.json({ ok: true, skipped: true, reason: "daily_automation_disabled" });
  if (!debugRun && !settings.enabled) { await recordSkippedAutomationRun("kr-bollinger-middle-lower", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!debugRun && !isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("kr-bollinger-middle-lower", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const intervalSeconds = Math.max(60, settings.intervalSeconds ?? 600);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, settings.cooldownSeconds ?? 0);
  const latestRun = await loadLatestExecutedAutomationRun("kr-bollinger-middle-lower").catch(() => null);
  const elapsedSeconds = latestRun?.started_at ? Math.max(0, (Date.now() - new Date(latestRun.started_at).getTime()) / 1000) : null;
  if (!debugRun && elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("kr-bollinger-middle-lower", reason, { intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) });
  }
  const result = await withAutomationRun("kr-bollinger-middle-lower", async () => {
    const scan = await withDailyBollingerRetry({ scope: "KR", zone: "MIDDLE_TO_LOWER" }, () => scanStoredKrBollingerBands({ moduleKey: "kr-bollinger-middle-lower" }));
    const cache = await persistDailyBollingerResults("KR", "MIDDLE_TO_LOWER", scan);
    const discord = await sendKrBollingerBandSignals(scan.results, "중단선~하단선", "kr-bollinger-middle-lower");
    return { ...scan, discord, cache };
  });
  return NextResponse.json({ ok: true, debugRun, intervalSeconds, cooldownSeconds: settings.cooldownSeconds, effectiveIntervalSeconds, data: result });
}
