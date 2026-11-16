import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { safeErrorMetadata } from "@/lib/error-diagnostics";
import { marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSource = url.searchParams.get("source");
  const source = rawSource?.trim().toUpperCase() || "";
  if (rawSource !== null && (!source || source.length > 64 || !/^[A-Z0-9_:-]+$/.test(source))) {
    return NextResponse.json({ ok: false, error: "INVALID_SOURCE" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null || rawLimit.trim() === "" ? 100 : (/^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const columns = { id: marketRssArticles.id, source: marketRssArticles.source, title: marketRssArticles.title, translatedTitle: marketRssArticles.translatedTitle, summary: marketRssArticles.summary, translatedSummary: marketRssArticles.translatedSummary, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker };
  try {
    const db = getDb();
    const rows = source
      ? await db.select(columns).from(marketRssArticles).where(eq(marketRssArticles.source, source)).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit)
      : await db.select(columns).from(marketRssArticles).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(limit);
    return NextResponse.json({ ok: true, items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API /market-news] RSS query failed", safeErrorMetadata(error));
    return NextResponse.json({ ok: false, error: "MARKET_NEWS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
