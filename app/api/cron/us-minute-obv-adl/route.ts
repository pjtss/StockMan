import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { scanUsMinuteObvAdl } from "@/lib/us-minute-obv-adl";
import { sendUsMinuteObvAdlSignals } from "@/lib/discord-us-minute-obv-adl";
import { readKisCache } from "@/lib/kis-cache";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-minute-obv-adl"); if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const latest = await loadLatestExecutedAutomationRun("us-minute-obv-adl").catch(() => null); const elapsed = latest?.started_at ? (Date.now() - new Date(latest.started_at).getTime()) / 1000 : null; const interval = Math.max(60, settings.intervalSeconds ?? 60); if (elapsed != null && elapsed < interval) { await recordSkippedAutomationRun("us-minute-obv-adl", "outside_interval", { elapsedSeconds: Math.round(elapsed), intervalSeconds: interval }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", elapsedSeconds: Math.round(elapsed), intervalSeconds: interval }); }
  try { return NextResponse.json(await withAutomationRun("us-minute-obv-adl", async () => { const previous = await readKisCache<{ qualified?: Array<{ market: string; code: string }> }>("minute-obv-adl:US:1m").catch(() => null); const previousKeys = new Set((previous?.qualified ?? []).map((item) => `${item.market}:${item.code}`)); const scan = await scanUsMinuteObvAdl(); const newlyQualified = scan.qualified.filter((item) => !previousKeys.has(`${item.market}:${item.code}`)); const discord = await sendUsMinuteObvAdlSignals(newlyQualified); return { ...scan, newlyQualified, previousQualifiedCount: previousKeys.size, discord }; })); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
