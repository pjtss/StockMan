import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { withAutomationLock } from "@/lib/automation-lock";
import { loadUsTurnoverSymbols } from "@/lib/us-turnover-symbols";
import { collectUsTradeIntensity } from "@/lib/us-trade-intensity-collector";
import { withAutomationRun } from "@/lib/automation-run";

async function handle(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("us-scanners");
    if (!settings.enabled || !isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: settings.enabled ? "outside_schedule" : "disabled" });
    const data = await withAutomationRun("us-trade-intensity", () => withAutomationLock("us-trade-intensity", async () => collectUsTradeIntensity(await loadUsTurnoverSymbols(), { maxSymbols: 10, delayMs: 350 })));
    return NextResponse.json({ ok: true, data: data ?? { skipped: true, reason: "already_running" } });
  } catch (error) {
    console.error("[OCI Cron] US trade intensity failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
