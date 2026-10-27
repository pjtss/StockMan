import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isMarketNewsSource, MARKET_NEWS_SOURCES, type MarketNewsKind, type MarketNewsSource } from "@/lib/market-news-contract";
import { getMarketNewsKoreanTitle } from "@/lib/market-news-korean-title";
import { marketRssArticles } from "@/lib/schema";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SOURCE_IDS = MARKET_NEWS_SOURCES.map((source) => source.id) as MarketNewsSource[];

type Cursor = {
  v: 1;
  hours: number;
  from: string;
  to: string;
  source: "ALL" | MarketNewsSource;
  ticker: string;
  kind: MarketNewsKind;
  publishedAt: string | null;
  id: number;
};

function errorResponse(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseInteger(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decodeCursor(value: string): Cursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (decoded.v !== 1 || typeof decoded.hours !== "number" || typeof decoded.from !== "string" || typeof decoded.to !== "string"
      || typeof decoded.source !== "string" || typeof decoded.ticker !== "string" || !["ALL", "NEWS", "FILING"].includes(decoded.kind ?? "")
      || !Number.isSafeInteger(decoded.id) || (decoded.id ?? 0) < 1
      || (decoded.publishedAt !== null && (typeof decoded.publishedAt !== "string" || Number.isNaN(Date.parse(decoded.publishedAt))))) return null;
    if (decoded.source !== "ALL" && !isMarketNewsSource(decoded.source)) return null;
    return decoded as Cursor;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hours = parseInteger(url.searchParams.get("hours"), 1);
  if (hours === null || hours < 1 || hours > 24) return errorResponse("INVALID_HOURS", 400);

  const requestedSource = (url.searchParams.get("source") || "ALL").trim().toUpperCase();
  if (requestedSource !== "ALL" && !isMarketNewsSource(requestedSource)) return errorResponse("INVALID_SOURCE", 400);
  const source = requestedSource as "ALL" | MarketNewsSource;

  const requestedKind = (url.searchParams.get("kind") || "ALL").trim().toUpperCase();
  if (requestedKind !== "ALL" && requestedKind !== "NEWS" && requestedKind !== "FILING") return errorResponse("INVALID_KIND", 400);
  const kind = requestedKind as MarketNewsKind;

  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (ticker && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return errorResponse("INVALID_TICKER", 400);

  const requestedPageSize = url.searchParams.get("pageSize");
  const legacyLimit = requestedPageSize === null;
  const pageSizeParam = requestedPageSize ?? url.searchParams.get("limit");
  const parsedPageSize = parseInteger(pageSizeParam, DEFAULT_PAGE_SIZE);
  if (parsedPageSize === null || parsedPageSize < 1 || (!legacyLimit && parsedPageSize > MAX_PAGE_SIZE)) return errorResponse("INVALID_PAGE_SIZE", 400);
  const pageSize = legacyLimit ? Math.min(parsedPageSize, MAX_PAGE_SIZE) : parsedPageSize;

  const now = new Date();
  const windowTo = now.toISOString();
  const windowFrom = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  const cursorParam = url.searchParams.get("cursor");
  if (cursorParam && cursorParam.length > 1_024) return errorResponse("INVALID_CURSOR", 400);
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) return errorResponse("INVALID_CURSOR", 400);
  if (cursor && (cursor.hours !== hours || cursor.source !== source || cursor.ticker !== ticker || cursor.kind !== kind
    || !Number.isFinite(Date.parse(cursor.from)) || !Number.isFinite(Date.parse(cursor.to))
    || Date.parse(cursor.from) !== Date.parse(cursor.to) - hours * 60 * 60 * 1000
    || Date.parse(cursor.to) > now.getTime() + 60_000 || Date.parse(cursor.to) < now.getTime() - 30 * 60 * 1000)) return errorResponse("CURSOR_SCOPE_MISMATCH", 400);

  const from = cursor?.from ?? windowFrom;
  const to = cursor?.to ?? windowTo;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const kindSources = kind === "FILING" ? ["SEC_EDGAR"] as const : kind === "NEWS" ? SOURCE_IDS.filter((item) => item !== "SEC_EDGAR") : SOURCE_IDS;
  const conditions = [
    inArray(marketRssArticles.source, [...kindSources]),
    or(
      and(gte(marketRssArticles.publishedAt, fromDate), lt(marketRssArticles.publishedAt, toDate)),
      and(isNull(marketRssArticles.publishedAt), gte(marketRssArticles.createdAt, fromDate), lt(marketRssArticles.createdAt, toDate)),
    ),
    ...(source === "ALL" ? [] : [eq(marketRssArticles.source, source)]),
    ...(ticker ? [eq(marketRssArticles.detectedTicker, ticker)] : []),
  ];

  if (cursor) {
    const cursorId = cursor.id;
    const cursorDate = cursor.publishedAt ? new Date(cursor.publishedAt) : null;
    conditions.push(cursorDate
      ? or(
        lt(marketRssArticles.publishedAt, cursorDate),
        and(eq(marketRssArticles.publishedAt, cursorDate), lt(marketRssArticles.id, cursorId)),
        isNull(marketRssArticles.publishedAt),
      )!
      : and(isNull(marketRssArticles.publishedAt), lt(marketRssArticles.id, cursorId))!);
  }

  try {
    const db = getDb();
    const rows = await db.select({
      id: marketRssArticles.id,
      source: marketRssArticles.source,
      title: marketRssArticles.title,
      translatedTitle: marketRssArticles.translatedTitle,
      translationStatus: marketRssArticles.translationStatus,
      translationSkippedReason: marketRssArticles.translationSkippedReason,
      translationFallback: marketRssArticles.translationFallback,
      link: marketRssArticles.link,
      publishedAt: marketRssArticles.publishedAt,
    }).from(marketRssArticles)
      .where(and(...conditions))
      .orderBy(sql`${marketRssArticles.publishedAt} DESC NULLS LAST`, desc(marketRssArticles.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({
      v: 1,
      hours,
      from,
      to,
      source,
      ticker,
      kind,
      publishedAt: last.publishedAt?.toISOString() ?? null,
      id: last.id,
    }) : null;

    const items = pageRows.map((row) => ({
      title: {
        original: row.title,
        ko: getMarketNewsKoreanTitle(row),
      },
      link: row.link,
    }));

    return NextResponse.json({
      ok: true,
      schemaVersion: "us-market-rss.v1",
      scope: { market: "US", sources: SOURCE_IDS, source, kind, ticker: ticker || null, window: { hours, from, to }, timezone: "UTC" },
      items,
      page: { pageSize, returned: items.length, nextCursor, hasMore },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("MARKET_NEWS_UNAVAILABLE", 503);
  }
}
