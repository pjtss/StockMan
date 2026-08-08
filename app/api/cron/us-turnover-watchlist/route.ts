import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationLock } from "@/lib/automation-lock";
import { withAutomationRun } from "@/lib/automation-run";
import { ensureSchema } from "@/lib/db";
import { scanUsTurnoverWatchlist } from "@/lib/us-turnover-watchlist-scanner";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";

async function handle(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchema();
  const settings = await loadFeatureModuleSettings("us-turnover-ratio");
  if (!settings.enabled) { await recordSkippedAutomationRun("us-turnover-ratio", "disabled", { source: "watchlist" }); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
  if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("us-turnover-ratio", "outside_schedule", { source: "watchlist" }); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
  const data = await withAutomationRun("us-turnover-ratio", () => withAutomationLock("us-turnover-watchlist", () => scanUsTurnoverWatchlist({ send: true })));
  return NextResponse.json({ ok: true, data });
}
export const GET = handle;
export const POST = handle;
