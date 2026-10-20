import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { ingestMarketRssArticles, notifyPendingMarketRssArticles, translatePendingMarketRssArticles } from "@/lib/market-rss-pipeline";
import { withAutomationRun } from "@/lib/automation-run";
import { withAutomationLock } from "@/lib/automation-lock";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { normalizeMarketRssSources } from "@/lib/market-rss-sources";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { syncMarketRssBullishArticles } from "@/lib/market-rss-bullish-repository";
import { getMarketRssBatchSize } from "@/lib/market-rss-batch-size";
import { getMarketRssCronStatus } from "@/lib/market-rss-cron-status";

function authorized(request: Request) { return isCronRequestAuthorized(request); }

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
    const result = await withAutomationLock("market-rss-pipeline", () => withAutomationRun("market-rss", async () => {
      const ingested = await ingestMarketRssArticles({ sources });
      const translated = await translatePendingMarketRssArticles(getMarketRssBatchSize(process.env.RSS_TRANSLATION_BATCH_SIZE, 50, 100));
      const bullish = await syncMarketRssBullishArticles();
      const notified = await notifyPendingMarketRssArticles(getMarketRssBatchSize(process.env.RSS_NOTIFICATION_BATCH_SIZE, 10, 100));
      const outcome = getMarketRssCronStatus(ingested.ingestFailureCount, translated);
      return { ok: true, mode: "COMMIT", ...outcome, sources, ingested, translated, bullish, notified };
    }));
    if (result === null) {
      await recordSkippedAutomationRun("market-rss", "already_running", { lockKey: "market-rss-pipeline" });
      return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "already_running" });
    }
    return NextResponse.json(result);
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, mode: "COMMIT", stage: diagnostics.errorCode === "SCHEMA_TABLE_MISSING" ? "load_feature_settings" : "pipeline", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
