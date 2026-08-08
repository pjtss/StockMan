import { NextResponse } from "next/server";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { filterUsDailyCandidates } from "@/lib/us-daily-common-filter";
import { withAutomationRun } from "@/lib/automation-run";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const moduleSettings = await loadFeatureModuleSettings("us-daily-indicators");
  if (!moduleSettings.enabled || !isWithinSchedule(moduleSettings, new Date())) return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule" });
  const envInterval = Number.parseInt(process.env.US_DAILY_INDICATORS_INTERVAL_SECONDS || "600", 10) || 600;
  const intervalSeconds = Math.max(60, moduleSettings.intervalSeconds ?? envInterval);
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const epochSeconds = Math.floor(Date.now() / 1000);
  if (now.getUTCDay() === 0 || epochSeconds % intervalSeconds >= 60) return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, schedule: "monday-saturday" });
  try {
    return NextResponse.json(await withAutomationRun("us-daily-indicators", async () => {
    const [mfi, dmi, macd] = await Promise.all([scanStoredUsMfiOversold(), scanStoredUsDmi(), scanStoredUsMacd()]);
    const [mfiFiltered, dmiFiltered, macdFiltered] = await Promise.all([mfi.qualified, dmi.qualified, macd.qualified].map((items) => filterUsDailyCandidates(items as any)));
    const discord = await sendUsDailyIndicatorSignals({ mfi: mfiFiltered.filtered as any, dmi: dmiFiltered.filtered as any, macd: macdFiltered.filtered as any });
    return { ok: discord.ok, mfi, dmi, macd, commonFilter: { excluded: { mfi: mfiFiltered.excludedCount, dmi: dmiFiltered.excludedCount, macd: macdFiltered.excludedCount }, settings: mfiFiltered.settings }, discord };
    }));
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
