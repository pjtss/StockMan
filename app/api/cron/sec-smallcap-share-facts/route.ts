import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { getPool } from "@/lib/db";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { isWithinSchedule } from "@/lib/schedule-time";
import { syncSecSmallcapShareFacts } from "@/lib/sec-smallcap-share-sync";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!process.env.SEC_USER_AGENT?.trim()) return NextResponse.json({ ok: false, error: "SEC_USER_AGENT_REQUIRED" }, { status: 503 });

  try {
    const moduleKey = "sec-smallcap-share-facts";
    const settings = await loadFeatureModuleSettings(moduleKey);
    if (!settings.enabled || !isWithinSchedule(settings, new Date())) {
      const reason = settings.enabled ? "outside_schedule" : "disabled";
      await recordSkippedAutomationRun(moduleKey, reason);
      return NextResponse.json({ ok: true, skipped: true, reason });
    }
    const intervalSeconds = Math.max(3600, settings.intervalSeconds ?? 86_400);
    const latest = await loadLatestExecutedAutomationRun(moduleKey).catch(() => null);
    const elapsed = latest?.started_at ? Math.round((Date.now() - new Date(latest.started_at).getTime()) / 1000) : null;
    const effectiveIntervalSeconds = latest?.status === "SUCCESS" ? intervalSeconds : Math.min(intervalSeconds, 3600);
    if (elapsed != null && elapsed < effectiveIntervalSeconds) {
      await recordSkippedAutomationRun(moduleKey, "outside_interval", { intervalSeconds: effectiveIntervalSeconds, configuredIntervalSeconds: intervalSeconds, elapsedSeconds: elapsed });
      return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds: effectiveIntervalSeconds, elapsedSeconds: elapsed });
    }

    const result = await withAutomationRun(moduleKey, () => syncSecSmallcapShareFacts(getPool()));
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("[API /cron/sec-smallcap-share-facts] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "SEC_SMALLCAP_SHARE_FACTS_FAILED" }, { status: 502 });
  }
}
