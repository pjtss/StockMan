import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source")?.trim().toUpperCase() || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
  const columns = { id: marketRssArticles.id, source: marketRssArticles.source, title: marketRssArticles.title, translatedTitle: marketRssArticles.translatedTitle, summary: marketRssArticles.summary, translatedSummary: marketRssArticles.translatedSummary, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker };
  const db = getDb();
  const rows = source
    ? await db.select(columns).from(marketRssArticles).where(eq(marketRssArticles.source, source)).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit)
    : await db.select(columns).from(marketRssArticles).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit);
  return NextResponse.json({ ok: true, items: rows });
}
