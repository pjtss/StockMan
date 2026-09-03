import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source")?.trim().toUpperCase() || "";
  const rawLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 100;
  const columns = { id: marketRssArticles.id, source: marketRssArticles.source, title: marketRssArticles.title, translatedTitle: marketRssArticles.translatedTitle, summary: marketRssArticles.summary, translatedSummary: marketRssArticles.translatedSummary, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker };
  try {
    const db = getDb();
    const rows = source
      ? await db.select(columns).from(marketRssArticles).where(eq(marketRssArticles.source, source)).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit)
      : await db.select(columns).from(marketRssArticles).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit);
    return NextResponse.json({ ok: true, items: rows });
  } catch { return NextResponse.json({ ok: false, error: "MARKET_NEWS_UNAVAILABLE" }, { status: 503 }); }
}
