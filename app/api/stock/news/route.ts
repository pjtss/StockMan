import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.replace(/^US:/i, "").trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return NextResponse.json({ ok: false, error: "ticker is required" }, { status: 400 });
  try {
    const rows = await getDb().select({ id: marketRssArticles.id, title: marketRssArticles.title, translatedTitle: marketRssArticles.translatedTitle, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, source: marketRssArticles.source, detectedTicker: marketRssArticles.detectedTicker }).from(marketRssArticles).where(sql`${eq(marketRssArticles.source, "STOCKTITAN")} AND UPPER(${marketRssArticles.detectedTicker}) = ${ticker}`).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(20);
    return NextResponse.json({ ok: true, ticker, source: "STOCKTITAN", items: rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
