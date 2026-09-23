import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
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
  const requestedPage = url.searchParams.get("page");
  const requestedPageSize = url.searchParams.get("pageSize") || url.searchParams.get("limit");
  const allRows = requestedPage == null && requestedPageSize == null;
  const requestedPageNumber = Number(requestedPage || 1);
  const page = Number.isFinite(requestedPageNumber) ? Math.max(1, Math.trunc(requestedPageNumber)) : 1;
  const rawPageSize = Number(requestedPageSize || 200);
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(Math.trunc(rawPageSize), 1), 500) : 200;
  const offset = (page - 1) * pageSize;
  if (!allRows && (!Number.isSafeInteger(offset) || offset > 1_000_000)) return NextResponse.json({ ok: false, error: "PAGE_OUT_OF_RANGE" }, { status: 400 });
  const range = dayRange(date);
  if (!range.valid) return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  try {
    const db = getDb();
    const domesticSources = ["KRX_KIND", "NEWSIS", "MK", "HANKYUNG", "ETODAY"];
    const includeRss = source === "ALL" || source === "RSS" || source === "STOCKTITAN" || source === "NASDAQ" || source === "NASDAQ_TRADER" || source === "GLOBENEWSWIRE" || source === "SEC_EDGAR" || domesticSources.includes(source);
    const includeFilings = source === "ALL" || source === "DART" || source === "SEC" || source === "SEC_EDGAR";
    const rssWhere = and(gte(marketRssArticles.publishedAt, range.start), lt(marketRssArticles.publishedAt, range.end), source === "ALL" ? undefined : eq(marketRssArticles.source, source));
    const filingWhere = and(eq(filings.publishedDateSeoul, date), source === "ALL" || source === "DART" ? undefined : eq(filings.source, source));
    const [rssCount, filingCount] = await Promise.all([
      includeRss ? db.select({ total: count() }).from(marketRssArticles).where(rssWhere) : [{ total: 0 }],
      includeFilings ? db.select({ total: count() }).from(filings).where(filingWhere) : [{ total: 0 }],
    ]);
    const total = Number(rssCount[0]?.total ?? 0) + Number(filingCount[0]?.total ?? 0);
    type RssDisclosureRow = { id: number; source: string; externalId: string; title: string; summary: string; content: string; link: string; publishedAt: Date | null; detectedTicker: string | null; fetchedAt: Date };
    type FilingDisclosureRow = { id: number; source: string; externalId: string; title: string; summary: string; link: string; publishedAt: Date; company: string; fetchedAt: Date };
    const readRssBatch = async (take: number, skip: number): Promise<RssDisclosureRow[]> => {
      if (!includeRss) return [];
      return db.select({ id: marketRssArticles.id, source: marketRssArticles.source, externalId: marketRssArticles.externalId, title: marketRssArticles.title, summary: marketRssArticles.summary, content: marketRssArticles.content, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker, fetchedAt: marketRssArticles.updatedAt }).from(marketRssArticles).where(rssWhere).orderBy(desc(marketRssArticles.publishedAt), desc(marketRssArticles.id)).limit(take).offset(skip);
    };
    const readFilingBatch = async (take: number, skip: number): Promise<FilingDisclosureRow[]> => {
      if (!includeFilings) return [];
      return db.select({ id: filings.id, source: filings.source, externalId: filings.externalId, title: filings.title, summary: filings.summary, link: filings.link, publishedAt: filings.publishedAt, company: filings.company, fetchedAt: filings.updatedAt }).from(filings).where(filingWhere).orderBy(desc(filings.publishedAt), desc(filings.id)).limit(take).offset(skip);
    };
    let rssRows: Awaited<ReturnType<typeof readRssBatch>> = [];
    let filingRows: Awaited<ReturnType<typeof readFilingBatch>> = [];
    if (allRows) {
      const batchSize = 500;
      for (let skip = 0; skip < total; skip += batchSize) {
        const [rssBatch, filingBatch] = await Promise.all([readRssBatch(batchSize, skip), readFilingBatch(batchSize, skip)]);
        rssRows.push(...rssBatch);
        filingRows.push(...filingBatch);
      }
    } else {
      [rssRows, filingRows] = await Promise.all([readRssBatch(offset + pageSize, 0), readFilingBatch(offset + pageSize, 0)]);
    }
    const merged = [...rssRows.map(row => ({ ...row, sourceType: "RSS" as const, companyNames: [], tickers: row.detectedTicker ? [row.detectedTicker] : [], contentStatus: row.content ? "FULL" : "METADATA_ONLY" })), ...filingRows.map(row => ({ ...row, sourceType: row.source === "DART" ? "DART" as const : "SEC_EDGAR" as const, companyNames: [row.company], tickers: [], content: null, contentStatus: "METADATA_ONLY" as const }))].sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0) || b.id - a.id);
    const items = allRows ? merged : merged.slice(offset, offset + pageSize);
    return NextResponse.json({ ok: true, date, source, sort: "publishedAt_desc", page: allRows ? null : page, pageSize: allRows ? null : pageSize, items, total, hasMore: allRows ? false : offset + items.length < total });
  } catch (error) {
    console.error("[API /disclosures] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "DISCLOSURES_UNAVAILABLE" }, { status: 503 });
  }
}
