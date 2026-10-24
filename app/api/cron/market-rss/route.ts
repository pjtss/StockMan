import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { ingestMarketRssArticles, notifyPendingMarketRssArticles, translatePendingMarketRssArticles } from "@/lib/market-rss-pipeline";
import { withAutomationRun } from "@/lib/automation-run";
import { withAutomationLock } from "@/lib/automation-lock";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { syncMarketRssBullishArticles } from "@/lib/market-rss-bullish-repository";
import { getMarketRssBatchSize } from "@/lib/market-rss-batch-size";
import { getMarketRssCronStatus } from "@/lib/market-rss-cron-status";
import type { MarketRssSource } from "@/lib/market-rss-sources";

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
    const sources: MarketRssSource[] = ["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"];
    const result = await withAutomationLock("market-rss-pipeline", () => withAutomationRun("market-rss", async () => {
      const ingested = await ingestMarketRssArticles({ sources });
      // Keep each one-minute OCI timer invocation bounded. The oldest-first
      // selectors continue the backlog on the next timer tick.
      const translationBatchSize = getMarketRssBatchSize(process.env.RSS_TRANSLATION_BATCH_SIZE, 3, 3);
      const notificationBatchSize = getMarketRssBatchSize(process.env.RSS_NOTIFICATION_BATCH_SIZE, 3, 3);
      const translationRuns: Awaited<ReturnType<typeof translatePendingMarketRssArticles>>[] = [];
      const notificationRuns: Awaited<ReturnType<typeof notifyPendingMarketRssArticles>>[] = [];
      const batch = await translatePendingMarketRssArticles(translationBatchSize);
      translationRuns.push(batch);
      const deliveries = await notifyPendingMarketRssArticles(notificationBatchSize);
      notificationRuns.push(deliveries);
      const translated = {
        attempted: translationRuns.reduce((sum, batch) => sum + batch.attempted, 0),
        translated: translationRuns.reduce((sum, batch) => sum + batch.translated, 0),
        notRequired: translationRuns.reduce((sum, batch) => sum + batch.notRequired, 0),
        fallback: translationRuns.reduce((sum, batch) => sum + batch.fallback, 0),
        failed: translationRuns.reduce((sum, batch) => sum + batch.failed, 0),
        fallbackReasons: translationRuns.reduce<Record<string, number>>((all, batch) => {
          for (const [reason, count] of Object.entries(batch.fallbackReasons)) all[reason] = (all[reason] || 0) + count;
          return all;
        }, {}),
        translationUsage: translationRuns.at(-1)?.translationUsage,
        limitReached: translationRuns.some((batch) => batch.limitReached),
        limitAlertSent: translationRuns.some((batch) => batch.limitAlertSent),
        thresholdAlerts: [...new Set(translationRuns.flatMap((batch) => batch.thresholdAlerts))],
        thresholdAlertSent: translationRuns.reduce((sum, batch) => sum + (batch.thresholdAlertSent ?? 0), 0),
      };
      const notified = {
        attempted: notificationRuns.reduce((sum, batch) => sum + batch.attempted, 0),
        sent: notificationRuns.reduce((sum, batch) => sum + batch.sent, 0),
        queueEnqueueFailed: notificationRuns.reduce((sum, batch) => sum + (batch.queueEnqueueFailed ?? 0), 0),
        skipped: notificationRuns.length > 0 && notificationRuns.every((batch) => batch.skipped),
        webhookConfigured: notificationRuns.every((batch) => batch.webhookConfigured),
      };
      const backlogRemaining = batch.attempted >= translationBatchSize || deliveries.attempted >= notificationBatchSize;
      const bullish = await syncMarketRssBullishArticles();
      const outcome = getMarketRssCronStatus(ingested.ingestFailureCount, translated);
      const deliveryIncomplete = !notified.webhookConfigured || notified.sent < notified.attempted;
      return { ok: true, mode: "COMMIT", ...outcome, backlogRemaining, degraded: outcome.degraded || deliveryIncomplete || backlogRemaining, deliveryIncomplete, sources, ingested, translated, notified, bullish };
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
