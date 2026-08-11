import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { refreshAllUsFreeFloat } from "@/lib/us-free-float-automation";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { withAutomationRun } from "@/lib/automation-run";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-free-float");
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const intervalSeconds = Math.max(86_400, settings.intervalSeconds ?? 86_400);
  const latest = await loadLatestExecutedAutomationRun("us-free-float").catch(() => null);
  const startedAt = latest?.started_at ? new Date(latest.started_at).getTime() : null;
  const elapsedSeconds = startedAt == null ? null : Math.max(0, (Date.now() - startedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < intervalSeconds) { await recordSkippedAutomationRun("us-free-float", "outside_interval", { intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, elapsedSeconds: Math.round(elapsedSeconds) }); }
  try { return NextResponse.json(await withAutomationRun("us-free-float", () => refreshAllUsFreeFloat({ concurrency: 4 }))); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
