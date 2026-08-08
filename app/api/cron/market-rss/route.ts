import { NextResponse } from "next/server";
import { ingestMarketRssArticles, notifyPendingMarketRssArticles, translatePendingMarketRssArticles } from "@/lib/market-rss-pipeline";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { normalizeMarketRssSources } from "@/lib/market-rss-sources";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

function authorized(request: Request) { return Boolean(process.env.CRON_SECRET && request.headers.get("x-cron-secret") === process.env.CRON_SECRET); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("market-rss");
    if (!settings.enabled) return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "disabled" });
    if (!isWithinSchedule(settings, new Date())) return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "outside_schedule" });
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
