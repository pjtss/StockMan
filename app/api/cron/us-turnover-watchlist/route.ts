import { NextResponse } from "next/server";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationLock } from "@/lib/automation-lock";
import { withAutomationRun } from "@/lib/automation-run";
import { ensureSchema } from "@/lib/db";
import { scanUsTurnoverWatchlist } from "@/lib/us-turnover-watchlist-scanner";

async function handle(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchema();
  const flags = await loadAdminFeatureFlags();
  const settings = await loadFeatureModuleSettings("us-turnover-ratio");
  if (!flags.us_turnover_ratio || !settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const data = await withAutomationRun("us-turnover-ratio", () => withAutomationLock("us-turnover-watchlist", () => scanUsTurnoverWatchlist({ send: true })));
  return NextResponse.json({ ok: true, data });
}
export const GET = handle;
export const POST = handle;
