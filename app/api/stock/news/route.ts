import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";
import { extractMarketRssCoreSummary } from "@/lib/market-rss-summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.replace(/^(?:US:|KR:)/i, "").trim().toUpperCase();
  if (!ticker || !/^(?:[A-Z0-9.\-]{1,15}|\d{6})$/.test(ticker)) return NextResponse.json({ ok: false, error: "ticker is required" }, { status: 400 });
  try {
    const rows = await getDb().select({ id: marketRssArticles.id, title: marketRssArticles.title, translatedTitle: marketRssArticles.translatedTitle, summary: marketRssArticles.summary, normalizedSummary: marketRssArticles.normalizedSummary, translatedSummary: marketRssArticles.translatedSummary, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, source: marketRssArticles.source, detectedTicker: marketRssArticles.detectedTicker, translationStatus: marketRssArticles.translationStatus }).from(marketRssArticles).where(sql`UPPER(${marketRssArticles.detectedTicker}) = ${ticker}`).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(50);
    const items = rows.map(({ normalizedSummary, ...row }) => ({
      ...row,
      // Prefer the persisted extraction; normalize legacy rows on read until they are naturally refreshed.
      summary: extractMarketRssCoreSummary(normalizedSummary || row.summary, row.title),
    }));
    return NextResponse.json({ ok: true, ticker, source: "ALL_MARKET_RSS", items });
  } catch {
    return NextResponse.json({ ok: false, error: "STOCK_NEWS_UNAVAILABLE" }, { status: 503 });
  }
}
