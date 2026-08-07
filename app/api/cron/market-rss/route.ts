import { NextResponse } from "next/server";
import { ingestMarketRssArticles, notifyPendingMarketRssArticles, translatePendingMarketRssArticles } from "@/lib/market-rss-pipeline";
import { withAutomationRun } from "@/lib/automation-run";

function authorized(request: Request) { return Boolean(process.env.CRON_SECRET && request.headers.get("x-cron-secret") === process.env.CRON_SECRET); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await withAutomationRun("market-rss", async () => {
      const ingested = await ingestMarketRssArticles();
      const translated = await translatePendingMarketRssArticles(Number(process.env.RSS_TRANSLATION_BATCH_SIZE || 3));
      const notified = await notifyPendingMarketRssArticles(Number(process.env.RSS_NOTIFICATION_BATCH_SIZE || 10));
      return { ok: true, ingested, translated, notified };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
