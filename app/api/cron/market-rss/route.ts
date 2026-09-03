import { NextResponse } from "next/server";
import { ingestMarketRssArticles, notifyPendingMarketRssArticles, translatePendingMarketRssArticles } from "@/lib/market-rss-pipeline";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { normalizeMarketRssSources } from "@/lib/market-rss-sources";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";

function authorized(request: Request) { return Boolean(process.env.CRON_SECRET && request.headers.get("x-cron-secret") === process.env.CRON_SECRET); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("market-rss");
    if (!settings.enabled) { await recordSkippedAutomationRun("market-rss", "disabled"); return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "disabled" }); }
    // The dedicated RSS timer is responsible for keeping the feed current
    // throughout the day. Other callers still honor the administrator's
    // configured schedule.
    const dedicatedRssScheduler = request.headers.get("x-rss-scheduler") === "1";
    if (!dedicatedRssScheduler && !isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("market-rss", "outside_schedule"); return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "outside_schedule" }); }
    const sources = normalizeMarketRssSources(settings.featureSettings?.marketRss?.enabledSources);
    const result = await withAutomationRun("market-rss", async () => {
      const ingested = await ingestMarketRssArticles({ sources });
      const translated = await translatePendingMarketRssArticles(Number(process.env.RSS_TRANSLATION_BATCH_SIZE || 3));
      const notified = await notifyPendingMarketRssArticles(Number(process.env.RSS_NOTIFICATION_BATCH_SIZE || 10));
      return { ok: true, mode: "COMMIT", sources, ingested, translated, notified };
    });
    return NextResponse.json(result);
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, mode: "COMMIT", stage: diagnostics.errorCode === "SCHEMA_TABLE_MISSING" ? "load_feature_settings" : "pipeline", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
