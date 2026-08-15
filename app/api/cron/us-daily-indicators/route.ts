import { NextResponse } from "next/server";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { filterUsDailyCandidates } from "@/lib/us-daily-common-filter";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { scanUsDailyTrend } from "@/lib/us-daily-trend-scan";
import { sendUsDailyTrendToDiscord } from "@/lib/discord-us-daily-trend";
import { scanStoredUsDailyAdl } from "@/lib/us-adl";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const moduleSettings = await loadFeatureModuleSettings("us-daily-indicators");
  if (!moduleSettings.enabled || !isWithinSchedule(moduleSettings, new Date())) { await recordSkippedAutomationRun("us-daily-indicators", moduleSettings.enabled ? "outside_schedule" : "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled_or_outside_schedule" }); }
  const envInterval = Number.parseInt(process.env.US_DAILY_INDICATORS_INTERVAL_SECONDS || "600", 10) || 600;
  const intervalSeconds = Math.max(60, moduleSettings.intervalSeconds ?? envInterval);
  const effectiveIntervalSeconds = Math.max(intervalSeconds, Math.max(0, moduleSettings.cooldownSeconds ?? 0));
  const latestRun = await loadLatestExecutedAutomationRun("us-daily-indicators").catch(() => null);
  const latestStartedAt = latestRun?.started_at ? new Date(latestRun.started_at).getTime() : null;
  const elapsedSeconds = latestStartedAt == null ? null : Math.max(0, (Date.now() - latestStartedAt) / 1000);
  if (elapsedSeconds != null && elapsedSeconds < effectiveIntervalSeconds) {
    const reason = latestRun?.status === "RUNNING" ? "already_running" : "outside_interval";
    await recordSkippedAutomationRun("us-daily-indicators", reason, { intervalSeconds, cooldownSeconds: moduleSettings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
    return NextResponse.json({ ok: true, skipped: true, reason, intervalSeconds, cooldownSeconds: moduleSettings.cooldownSeconds, effectiveIntervalSeconds, elapsedSeconds: Math.round(elapsedSeconds), latestRunStatus: latestRun?.status });
  }
  try {
    const result = await withAutomationRun("us-daily-indicators", async () => {
    const context = await createUsDailyScanContext({ candleLimit: 100 });
    const [mfi, dmi, macd, obv, adl, trend] = await Promise.all([scanStoredUsMfiOversold({ context }), scanStoredUsDmi({ context }), scanStoredUsMacd({ context }), scanStoredUsDailyObv({ context }), scanStoredUsDailyAdl({ context }), scanUsDailyTrend({ context })]);
    const [mfiFiltered, dmiFiltered, macdFiltered, obvFiltered, adlFiltered] = await Promise.all([mfi.qualified, dmi.qualified, macd.qualified, obv.qualified, adl.qualified].map((items) => filterUsDailyCandidates(items as any)));
    const discord = await sendUsDailyIndicatorSignals({ mfi: mfiFiltered.filtered as any, dmi: dmiFiltered.filtered as any, macd: macdFiltered.filtered as any, obv: obvFiltered.filtered as any, adl: adlFiltered.filtered as any });
    const trendDiscord = await sendUsDailyTrendToDiscord(trend.results);
    return {
      ok: discord.ok,
      mfi,
      dmi,
      macd,
      obv,
      adl,
      trend,
      commonFilter: {
        excluded: { mfi: mfiFiltered.excludedCount, dmi: dmiFiltered.excludedCount, macd: macdFiltered.excludedCount, obv: obvFiltered.excludedCount, adl: adlFiltered.excludedCount },
        failureReasons: { mfi: mfiFiltered.failureReasons, dmi: dmiFiltered.failureReasons, macd: macdFiltered.failureReasons, obv: obvFiltered.failureReasons, adl: adlFiltered.failureReasons },
        matchedMetricCount: { mfi: mfiFiltered.matchedMetricCount, dmi: dmiFiltered.matchedMetricCount, macd: macdFiltered.matchedMetricCount, obv: obvFiltered.matchedMetricCount, adl: adlFiltered.matchedMetricCount },
        settings: mfiFiltered.settings,
      },
      discord,
      trendDiscord,
    };
    });
    return NextResponse.json({ intervalSeconds, cooldownSeconds: moduleSettings.cooldownSeconds, effectiveIntervalSeconds, ...result });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
