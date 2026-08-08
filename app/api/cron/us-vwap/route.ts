import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationLock } from "@/lib/automation-lock";
import { runUsVwapAutomation } from "@/lib/us-vwap";
import { withAutomationRun } from "@/lib/automation-run";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";
async function handle(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadFeatureModuleSettings("us-vwap");
  if (!settings.enabled) { await recordSkippedAutomationRun("us-vwap", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("us-vwap", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  return NextResponse.json({ ok: true, data: await withAutomationRun("us-vwap", () => withAutomationLock("us-vwap", runUsVwapAutomation)) });
}
export const GET = handle; export const POST = handle;
