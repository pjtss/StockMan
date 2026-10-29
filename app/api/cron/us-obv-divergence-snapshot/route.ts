import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadLatestExecutedAutomationRun } from "@/lib/automation-run-repository";
import { refreshUsObvDivergenceSnapshot } from "@/lib/us-obv-divergence-snapshot";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("us-obv-divergence-snapshot");
    if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
    const intervalSeconds = Math.max(1_800, settings.intervalSeconds ?? 1_800);
    const latestRun = await loadLatestExecutedAutomationRun("us-obv-divergence-snapshot").catch(() => null);
    const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
    if (latestStartedAt != null && Date.now() - latestStartedAt < intervalSeconds * 1_000) {
      return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds });
    }
    const result = await withAutomationRun("us-obv-divergence-snapshot", () => refreshUsObvDivergenceSnapshot());
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /cron/us-obv-divergence-snapshot] Error:", error instanceof Error ? error.message.slice(0, 1_000) : "unknown error");
    return NextResponse.json({ ok: false, error: "US_OBV_DIVERGENCE_REFRESH_FAILED" }, { status: 502 });
  }
}
