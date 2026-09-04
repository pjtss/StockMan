import { NextResponse } from "next/server";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { filings, marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end, valid: /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(start.getTime()) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const source = (url.searchParams.get("source") || "all").trim().toUpperCase();
  const rawLimit = Number(url.searchParams.get("limit") || 200);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 200;
  const range = dayRange(date);
  if (!range.valid) return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  try {
    const db = getDb();
    const domesticSources = ["KRX_KIND", "NEWSIS", "MK", "HANKYUNG", "ETODAY"];
    const includeRss = source === "ALL" || source === "RSS" || source === "STOCKTITAN" || source === "NASDAQ" || source === "NASDAQ_TRADER" || source === "GLOBENEWSWIRE" || source === "SEC_EDGAR" || domesticSources.includes(source);
    const includeFilings = source === "ALL" || source === "DART" || source === "SEC" || source === "SEC_EDGAR";
    const [rssRows, filingRows] = await Promise.all([
      includeRss ? db.select({ id: marketRssArticles.id, source: marketRssArticles.source, externalId: marketRssArticles.externalId, title: marketRssArticles.title, summary: marketRssArticles.summary, content: marketRssArticles.content, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker, fetchedAt: marketRssArticles.updatedAt }).from(marketRssArticles).where(and(gte(marketRssArticles.publishedAt, range.start), lt(marketRssArticles.publishedAt, range.end), source === "ALL" ? undefined : eq(marketRssArticles.source, source))).orderBy(desc(marketRssArticles.publishedAt)).limit(limit) : [],
      includeFilings ? db.select({ id: filings.id, source: filings.source, externalId: filings.externalId, title: filings.title, summary: filings.summary, link: filings.link, publishedAt: filings.publishedAt, company: filings.company, fetchedAt: filings.updatedAt }).from(filings).where(and(eq(filings.publishedDateSeoul, date), source === "ALL" || source === "DART" ? undefined : eq(filings.source, source))).orderBy(desc(filings.publishedAt)).limit(limit) : [],
    ]);
    const items = [...rssRows.map(row => ({ ...row, sourceType: "RSS" as const, companyNames: [], tickers: row.detectedTicker ? [row.detectedTicker] : [], contentStatus: row.content ? "FULL" : "METADATA_ONLY" })), ...filingRows.map(row => ({ ...row, sourceType: row.source === "DART" ? "DART" as const : "SEC_EDGAR" as const, companyNames: [row.company], tickers: [], content: null, contentStatus: "METADATA_ONLY" as const }))].sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0)).slice(0, limit);
    return NextResponse.json({ ok: true, date, source, sort: "publishedAt_desc", items, total: items.length });
  } catch (error) {
    console.error("[API /disclosures] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "DISCLOSURES_UNAVAILABLE" }, { status: 503 });
  }
}
