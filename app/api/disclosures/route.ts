import { NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns, filings, marketRssArticles, marketRssFetchSnapshots, secCompanies, secFilingEvents, secSourceSnapshots, secSubmissions } from "@/lib/schema";
import { createRssTimeWindow, parseRssHours } from "@/lib/rss-time-window";
import { getSeoulDateKey } from "@/lib/seoul-date";
import { projectMarketRssSourceCoverage } from "@/lib/disclosure-source-coverage";

export const dynamic = "force-dynamic";

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = match ? Number(match[1]) : 0;
  const month = match ? Number(match[2]) : 0;
  const day = match ? Number(match[3]) : 0;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  const valid = match !== null && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && !Number.isNaN(start.getTime());
  return { start, end, valid };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedHours = parseRssHours(url.searchParams.get("hours"));
  if (Number.isNaN(requestedHours)) return NextResponse.json({ ok: false, error: "INVALID_HOURS", allowed: { min: 1, max: 24 } }, { status: 400 });
  const hours = requestedHours ?? null;
  const requestedAsOf = url.searchParams.get("asOf");
  const parsedAsOf = requestedAsOf === null ? null : new Date(requestedAsOf);
  const parsedAsOfTime = parsedAsOf?.getTime();
  if (requestedAsOf !== null && (requestedHours === null || parsedAsOfTime == null || Number.isNaN(parsedAsOfTime) || parsedAsOf?.toISOString() !== requestedAsOf || parsedAsOfTime > Date.now())) {
    return NextResponse.json({ ok: false, error: "INVALID_AS_OF" }, { status: 400 });
  }
  const now = parsedAsOf ?? new Date();
  const date = url.searchParams.get("date") || getSeoulDateKey(now);
  const source = (url.searchParams.get("source") || "all").trim().toUpperCase();
  const searchQuery = (url.searchParams.get("q") ?? "").trim();
  if (Array.from(searchQuery).length > 120 || /[\u0000-\u001f\u007f]/.test(searchQuery)) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY", maxLength: 120 }, { status: 400 });
  }
  const requestedPage = url.searchParams.get("page");
  const requestedPageSize = url.searchParams.get("pageSize") || url.searchParams.get("limit");
  const allRows = requestedPage == null && requestedPageSize == null;
  const requestedPageNumber = Number(requestedPage || 1);
  const page = Number.isFinite(requestedPageNumber) ? Math.max(1, Math.trunc(requestedPageNumber)) : 1;
  const rawPageSize = Number(requestedPageSize || 200);
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(Math.trunc(rawPageSize), 1), 500) : 200;
  const offset = (page - 1) * pageSize;
  if (!allRows && (!Number.isSafeInteger(offset) || offset > 1_000_000)) return NextResponse.json({ ok: false, error: "PAGE_OUT_OF_RANGE" }, { status: 400 });
  const range = hours === null ? dayRange(date) : createRssTimeWindow(hours, now);
  if (hours === null && "valid" in range && !range.valid) return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  const queryWindow = {
    kind: hours === null ? "KST_CALENDAR_DAY" as const : "ROLLING_HOURS" as const,
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    endExclusive: true as const,
  };
    const automationRunWindow = and(
      lt(automationRuns.startedAt, range.end),
      or(isNull(automationRuns.finishedAt), gte(automationRuns.finishedAt, range.start)),
    );
  try {
    const db = getDb();
    return await db.transaction(async (tx) => {
    const domesticSources = ["KRX_KIND", "NEWSIS", "MK", "HANKYUNG", "ETODAY"];
    const includeRss = source === "ALL" || source === "RSS" || source === "STOCKTITAN" || source === "NASDAQ" || source === "NASDAQ_TRADER" || source === "GLOBENEWSWIRE" || source === "SEC_EDGAR" || domesticSources.includes(source);
    const includeMarketRssRun = source === "ALL" || source === "RSS" || source === "STOCKTITAN" || source === "SEC_EDGAR" || source === "GLOBENEWSWIRE";
    const includeFilings = hours === null && (source === "ALL" || source === "DART");
    const includeSecSubmissions = hours === null && (source === "ALL" || source === "SEC");
    const includeDartRun = source === "ALL" || source === "DART";
    const includeSecRun = source === "ALL" || source === "SEC";
    const coverageModuleKeys = [
      ...(includeMarketRssRun ? ["market-rss"] : []),
      ...(includeDartRun ? ["dart-realtime"] : []),
      ...(includeSecRun ? ["sec-realtime"] : []),
    ];
    const containsText = (column: SQLWrapper) => sql<boolean>`position(lower(${searchQuery}) in lower(coalesce(${column}, ''))) > 0`;
    const rssTimeRange = and(gte(marketRssArticles.publishedAt, range.start), lt(marketRssArticles.publishedAt, range.end));
    const rssWindowWhere = hours === null
      ? or(
          and(eq(marketRssArticles.rssTimestampPrecision, "DATE"), eq(marketRssArticles.rssPublishedDate, date)),
          and(sql`${marketRssArticles.rssTimestampPrecision} <> 'DATE'`, rssTimeRange),
        )
      : and(rssTimeRange, eq(marketRssArticles.rssTimestampPrecision, "INSTANT"));
    const rssSearchWhere = searchQuery ? or(containsText(marketRssArticles.title), containsText(marketRssArticles.summary), containsText(marketRssArticles.content), containsText(marketRssArticles.detectedTicker)) : undefined;
    const filingSearchWhere = searchQuery ? or(containsText(filings.title), containsText(filings.summary), containsText(filings.company), containsText(filings.externalId)) : undefined;
    const secSearchWhere = searchQuery ? or(containsText(secSubmissions.accession), containsText(secSubmissions.cik), containsText(secSubmissions.form), containsText(secSubmissions.primaryDocDescription), containsText(secCompanies.name), sql<boolean>`position(lower(${searchQuery}) in lower(coalesce(array_to_string(${secCompanies.tickers}, ' '), ''))) > 0`, containsText(secFilingEvents.bodyExcerpt)) : undefined;
    const rssWhere = and(rssWindowWhere, source === "ALL" ? undefined : eq(marketRssArticles.source, source), rssSearchWhere);
    const filingWhere = and(eq(filings.source, "DART"), eq(filings.publishedDateSeoul, date), filingSearchWhere);
    const secSubmissionWhere = and(eq(secSubmissions.filingDate, date), secSearchWhere);
    const [rssCount, filingCount, secSubmissionCount, coverageRunRows] = await Promise.all([
      includeRss ? tx.select({ total: count() }).from(marketRssArticles).where(rssWhere) : [{ total: 0 }],
      includeFilings ? tx.select({ total: count() }).from(filings).where(filingWhere) : [{ total: 0 }],
      includeSecSubmissions ? tx.select({ total: count() }).from(secSubmissions).leftJoin(secCompanies, eq(secCompanies.cik, secSubmissions.cik)).leftJoin(secFilingEvents, eq(secFilingEvents.accession, secSubmissions.accession)).where(secSubmissionWhere) : [{ total: 0 }],
      coverageModuleKeys.length > 0 ? tx.selectDistinctOn([automationRuns.moduleKey], { moduleKey: automationRuns.moduleKey, id: automationRuns.id, status: automationRuns.status, startedAt: automationRuns.startedAt, finishedAt: automationRuns.finishedAt, summary: automationRuns.summary }).from(automationRuns).where(and(inArray(automationRuns.moduleKey, coverageModuleKeys), automationRunWindow)).orderBy(asc(automationRuns.moduleKey), desc(automationRuns.startedAt)) : [],
    ]);
    const latestRunByModule = new Map<string, (typeof coverageRunRows)[number]>();
    for (const run of coverageRunRows) if (!latestRunByModule.has(run.moduleKey)) latestRunByModule.set(run.moduleKey, run);
    const sourceCoverage = projectMarketRssSourceCoverage(latestRunByModule.get("market-rss") ?? null, source, latestRunByModule.get("dart-realtime") ?? null, latestRunByModule.get("sec-realtime") ?? null, queryWindow);
    const total = Number(rssCount[0]?.total ?? 0) + Number(filingCount[0]?.total ?? 0) + Number(secSubmissionCount[0]?.total ?? 0);
    type RssDisclosureRow = { id: number; sourceSnapshotId: number | null; rssTimestampPrecision: string; rssPublishedDate: string | null; source: string; externalId: string; title: string; summary: string; content: string; link: string; publishedAt: Date | null; detectedTicker: string | null; fetchedAt: Date | null };
    type FilingDisclosureRow = { id: number; source: string; externalId: string; title: string; summary: string; link: string; publishedAt: Date; filedAt: string; company: string; fetchedAt: Date | null };
    type SecDisclosureRow = { accession: string; cik: string; form: string; filingDate: string; primaryDocDescription: string | null; filingUrl: string; companyName: string | null; tickers: string[] | null; bodyExcerpt: string | null; snapshotId: string | null; fetchedAt: Date | null };
    const readRssBatch = async (take: number, skip: number): Promise<RssDisclosureRow[]> => {
      if (!includeRss) return [];
      return tx.select({ id: marketRssArticles.id, sourceSnapshotId: marketRssArticles.sourceSnapshotId, rssTimestampPrecision: marketRssArticles.rssTimestampPrecision, rssPublishedDate: marketRssArticles.rssPublishedDate, source: marketRssArticles.source, externalId: marketRssArticles.externalId, title: marketRssArticles.title, summary: marketRssArticles.summary, content: marketRssArticles.content, link: marketRssArticles.link, publishedAt: marketRssArticles.publishedAt, detectedTicker: marketRssArticles.detectedTicker, fetchedAt: marketRssFetchSnapshots.fetchedAt }).from(marketRssArticles).leftJoin(marketRssFetchSnapshots, eq(marketRssArticles.sourceSnapshotId, marketRssFetchSnapshots.id)).where(rssWhere).orderBy(desc(marketRssArticles.publishedAt), asc(marketRssArticles.externalId)).limit(take).offset(skip);
    };
    const readFilingBatch = async (take: number, skip: number): Promise<FilingDisclosureRow[]> => {
      if (!includeFilings) return [];
      return tx.select({ id: filings.id, source: filings.source, externalId: filings.externalId, title: filings.title, summary: filings.summary, link: filings.link, publishedAt: filings.publishedAt, filedAt: filings.publishedDateSeoul, company: filings.company, fetchedAt: sql<Date | null>`NULL::timestamptz`.as("fetchedAt") }).from(filings).where(filingWhere).orderBy(asc(filings.externalId)).limit(take).offset(skip);
    };
    const readSecBatch = async (take: number, skip: number): Promise<SecDisclosureRow[]> => {
      if (!includeSecSubmissions) return [];
      return tx.select({
        accession: secSubmissions.accession,
        cik: secSubmissions.cik,
        form: secSubmissions.form,
        filingDate: secSubmissions.filingDate,
        primaryDocDescription: secSubmissions.primaryDocDescription,
        filingUrl: secSubmissions.filingUrl,
        companyName: secCompanies.name,
        tickers: secCompanies.tickers,
        bodyExcerpt: secFilingEvents.bodyExcerpt,
        snapshotId: sql<string | null>`(
          SELECT source_snapshot.id::text
          FROM ${secSourceSnapshots} AS source_snapshot
          WHERE source_snapshot.source_type = 'SUBMISSIONS'
            AND source_snapshot.source_key = ${secSubmissions.cik}
            AND source_snapshot.raw_payload::jsonb->'filings'->'recent'->'accessionNumber' @> jsonb_build_array(${secSubmissions.accession})
          ORDER BY source_snapshot.fetched_at DESC
          LIMIT 1
        )`.as("snapshotId"),
        fetchedAt: sql<Date | null>`(
          SELECT MAX(source_snapshot.fetched_at)
          FROM ${secSourceSnapshots} AS source_snapshot
          WHERE source_snapshot.source_type = 'SUBMISSIONS'
            AND source_snapshot.source_key = ${secSubmissions.cik}
            AND source_snapshot.raw_payload::jsonb->'filings'->'recent'->'accessionNumber' @> jsonb_build_array(${secSubmissions.accession})
        )`.as("fetchedAt"),
      }).from(secSubmissions)
        .leftJoin(secCompanies, eq(secCompanies.cik, secSubmissions.cik))
        .leftJoin(secFilingEvents, eq(secFilingEvents.accession, secSubmissions.accession))
        .where(secSubmissionWhere)
        .orderBy(desc(secSubmissions.filingDate), asc(secSubmissions.accession))
        .limit(take).offset(skip);
    };
    let rssRows: Awaited<ReturnType<typeof readRssBatch>> = [];
    let filingRows: Awaited<ReturnType<typeof readFilingBatch>> = [];
    let secRows: Awaited<ReturnType<typeof readSecBatch>> = [];
    if (allRows) {
      const batchSize = 500;
      for (let skip = 0; skip < total; skip += batchSize) {
        const [rssBatch, filingBatch, secBatch] = await Promise.all([readRssBatch(batchSize, skip), readFilingBatch(batchSize, skip), readSecBatch(batchSize, skip)]);
        rssRows.push(...rssBatch);
        filingRows.push(...filingBatch);
        secRows.push(...secBatch);
      }
    } else {
      [rssRows, filingRows, secRows] = await Promise.all([readRssBatch(offset + pageSize, 0), readFilingBatch(offset + pageSize, 0), readSecBatch(offset + pageSize, 0)]);
    }
    const merged = [
      ...rssRows.map(row => {
        const { rssTimestampPrecision, rssPublishedDate, ...publicRow } = row;
        const sortBasis = row.publishedAt && rssTimestampPrecision === "INSTANT" ? "PUBLISHED_INSTANT" as const : "UNKNOWN" as const;
        return { ...publicRow, id: `${row.source}:${row.externalId}`, sourceSnapshotId: row.sourceSnapshotId === null ? null : String(row.sourceSnapshotId), sourceType: "RSS" as const, publishedAt: rssTimestampPrecision === "INSTANT" ? row.publishedAt : null, filedAt: rssPublishedDate, filedAtPrecision: rssTimestampPrecision === "DATE" ? "DATE" as const : "UNKNOWN" as const, sortBasis, companyNames: [], tickers: row.detectedTicker ? [row.detectedTicker] : [], contentStatus: row.content ? "FULL" as const : "METADATA_ONLY" as const };
      }),
      ...filingRows.map(row => ({ ...row, id: `${row.source}:${row.externalId}`, sourceSnapshotId: null, publishedAt: null, sourceType: "DART" as const, filedAtPrecision: "DATE" as const, sortBasis: "FILED_DATE" as const, companyNames: [row.company], tickers: [], content: null, contentStatus: "METADATA_ONLY" as const })),
      ...secRows.map(row => ({ id: `SEC:${row.accession}`, source: "SEC", sourceType: "SEC_EDGAR" as const, externalId: row.accession, title: row.primaryDocDescription || row.form, summary: null, content: row.bodyExcerpt || null, contentStatus: row.bodyExcerpt ? "EXCERPT" as const : "METADATA_ONLY" as const, link: row.filingUrl, publishedAt: null, filedAt: row.filingDate, filedAtPrecision: "DATE" as const, sortBasis: "FILED_DATE" as const, fetchedAt: row.fetchedAt, sourceSnapshotId: row.snapshotId, companyNames: row.companyName ? [row.companyName] : [], tickers: row.tickers || [], formType: row.form })),
    ];
    type SortableDisclosure = { sortBasis: string; filedAt: string | null; publishedAt: Date | null; fetchedAt: Date | null };
    const sortValue = (item: SortableDisclosure) => item.sortBasis === "FILED_DATE"
      ? item.filedAt ? new Date(`${item.filedAt}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY
      : item.sortBasis === "PUBLISHED_INSTANT"
        ? item.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY
        : item.sortBasis === "VERIFIED_FETCH_INSTANT"
          ? item.fetchedAt?.getTime() ?? Number.NEGATIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
    merged.sort((a, b) => {
      const rank = (basis: string) => basis === "PUBLISHED_INSTANT" ? 0 : basis === "FILED_DATE" ? 1 : basis === "VERIFIED_FETCH_INSTANT" ? 2 : 3;
      const basisDifference = rank(a.sortBasis) - rank(b.sortBasis);
      if (basisDifference) return basisDifference;
      return sortValue(b) - sortValue(a) || a.source.localeCompare(b.source) || a.externalId.localeCompare(b.externalId);
    });
    const items = allRows ? merged : merged.slice(offset, offset + pageSize);
    return NextResponse.json({ ok: true, queryStatus: total === 0 ? "NO_MATCHING_STORED_ROWS" : "DB_QUERY_COMPLETE", sourceCoverage, date: hours === null ? date : null, displayTimezone: "Asia/Seoul", queryWindow, window: hours === null ? null : { hours, from: range.start.toISOString(), to: range.end.toISOString() }, source, q: searchQuery || null, sort: "timestamp_precision_group_desc", sortTieBreak: "source_externalId_asc", page: allRows ? null : page, pageSize: allRows ? null : pageSize, items, total, hasMore: allRows ? false : offset + items.length < total });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  } catch (error) {
    console.error("[API /disclosures] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "DISCLOSURES_UNAVAILABLE" }, { status: 503 });
  }
}
