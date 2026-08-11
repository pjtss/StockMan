import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles, marketRssFetchSnapshots, secCompanies, secFilingDocuments, secFilingEvents, secSubmissions } from "@/lib/schema";
import { getMarketRssGrade, MARKET_RSS_GRADE_LABELS, type MarketRssGrade } from "@/lib/market-rss-grade";

export type DailyMarketRssAnalysisItem = {
  source: string;
  sourceType: "RSS" | "SEC_SUBMISSIONS";
  externalId: string;
  sourceSnapshotId: number | null;
  publishedAt: string | null;
  titleOriginal: string;
  titleTranslated: string | null;
  summary: string;
  translatedSummary: string | null;
  link: string;
  ticker: string | null;
  company: string | null;
  exchange: string | null;
  cik: string | null;
  form: string | null;
  filingDate: string | null;
  reportDate: string | null;
  acceptanceDateTime: string | null;
  primaryDocument: string | null;
  primaryDocDescription: string | null;
  secItems: string[];
  category: string;
  grade: string;
  gradeCode: MarketRssGrade;
  priority: number;
  score: number;
  direction: string;
  matchedTerms: string[];
  financingAmountUsd: number | null;
  dilutionRisk: string | null;
  insiderAction: string | null;
  bodyExcerpt: string;
  translationStatus: string | null;
  translationFallback: boolean;
  notificationStatus: string | null;
  dataQuality: {
    rawPayloadAvailable: boolean;
    fullDocumentAvailable: boolean;
    bodyExcerptAvailable: boolean;
    translationFallback: boolean;
  };
};

export type DailyMarketRssCompactItem = { title: string; link: string; grade: string };

function kstDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const start = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new Error("invalid date");
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function getSecSubmissionGrade(score: number | null | undefined): MarketRssGrade {
  const value = Number(score ?? 0);
  if (value >= 70) return "high";
  if (value >= 50) return "medium";
  if (value > 0) return "low";
  return "excluded";
}

function secIdentity(value: string) {
  const accession = value.match(/\b\d{10}-\d{2}-\d{6}\b/);
  return accession ? `SEC:${accession[0]}` : "";
}

function identityFor(title: string, link: string, externalId = "") {
  const sec = secIdentity(`${externalId} ${link}`);
  if (sec) return sec;
  const normalizedLink = link.trim().replace(/\/+$/, "").toLowerCase();
  return normalizedLink || `TITLE:${title.trim().toLowerCase()}`;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function safeIso(value: string | null | undefined, fallback: string | null = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function splitItems(value: string | null | undefined) {
  return value ? value.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean) : [];
}

function gradeRank(value: MarketRssGrade) {
  return value === "high" ? 3 : value === "medium" ? 2 : value === "low" ? 1 : 0;
}

type Candidate = {
  identity: string;
  priority: number;
  publishedAtMs: number;
  analysis: DailyMarketRssAnalysisItem;
  compact: DailyMarketRssCompactItem;
  raw: Record<string, unknown>;
};

export async function loadDailyMarketRssExport(date: string, options?: { includeRaw?: boolean }) {
  const { start, end } = kstDayBounds(date);
  const db = getDb();
  const [rssRows, secRows, companies] = await Promise.all([
    db.select().from(marketRssArticles).where(and(gte(marketRssArticles.publishedAt, start), lt(marketRssArticles.publishedAt, end))).orderBy(desc(marketRssArticles.priority), desc(marketRssArticles.publishedAt)),
    db.select().from(secSubmissions).where(eq(secSubmissions.filingDate, date)).orderBy(desc(secSubmissions.classifiedScore), desc(secSubmissions.updatedAt)),
    db.select().from(secCompanies),
  ]);
  const accessions = [...new Set(secRows.map((row) => row.accession))];
  const [events, documentRows] = accessions.length ? await Promise.all([
    db.select().from(secFilingEvents).where(inArray(secFilingEvents.accession, accessions)),
    options?.includeRaw
      ? db.select().from(secFilingDocuments).where(inArray(secFilingDocuments.accession, accessions))
      : db.select({ accession: secFilingDocuments.accession, indexUrl: secFilingDocuments.indexUrl, primaryUrl: secFilingDocuments.primaryUrl, hasFullDocument: sql<boolean>`length(${secFilingDocuments.primaryHtml}) > 0` }).from(secFilingDocuments).where(inArray(secFilingDocuments.accession, accessions)),
  ]) : [[], []];
  const documents = documentRows.map((document) => ({
    accession: document.accession,
    indexUrl: document.indexUrl,
    primaryUrl: document.primaryUrl,
    hasFullDocument: "primaryHtml" in document ? Boolean(document.primaryHtml) : document.hasFullDocument,
    indexHtml: "indexHtml" in document ? document.indexHtml : undefined,
    primaryHtml: "primaryHtml" in document ? document.primaryHtml : undefined,
    primaryText: "primaryText" in document ? document.primaryText : undefined,
  }));
  const companyMap = new Map(companies.map((company) => [company.cik, company]));
  const eventMap = new Map(events.map((event) => [event.accession, event]));
  const documentMap = new Map(documents.map((document) => [document.accession, document]));
  const snapshotIds = [...new Set(rssRows.map((row) => row.sourceSnapshotId).filter((value): value is number => typeof value === "number"))];
  const snapshots = snapshotIds.length ? await db.select().from(marketRssFetchSnapshots).where(inArray(marketRssFetchSnapshots.id, snapshotIds)) : [];
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const candidates: Candidate[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const row of rssRows) {
    const gradeCode = getMarketRssGrade(row);
    const analysis: DailyMarketRssAnalysisItem = {
      source: row.source,
      sourceType: "RSS",
      externalId: row.externalId,
      sourceSnapshotId: row.sourceSnapshotId ?? null,
      publishedAt: iso(row.publishedAt),
      titleOriginal: row.title,
      titleTranslated: row.translatedTitle,
      summary: row.summary,
      translatedSummary: row.translatedSummary,
      link: row.link,
      ticker: row.detectedTicker,
      company: null,
      exchange: null,
      cik: null,
      form: null,
      filingDate: null,
      reportDate: null,
      acceptanceDateTime: null,
      primaryDocument: null,
      primaryDocDescription: null,
      secItems: [],
      category: row.category,
      grade: MARKET_RSS_GRADE_LABELS[gradeCode],
      gradeCode,
      priority: row.priority,
      score: row.priority,
      direction: row.eventDirection,
      matchedTerms: row.matchedTerms,
      financingAmountUsd: row.financingAmountUsd,
      dilutionRisk: row.dilutionRisk,
      insiderAction: null,
      bodyExcerpt: "",
      translationStatus: row.translationStatus,
      translationFallback: row.translationFallback,
      notificationStatus: row.notificationStatus,
      dataQuality: {
        rawPayloadAvailable: Boolean(row.rawPayload),
        fullDocumentAvailable: false,
        bodyExcerptAvailable: false,
        translationFallback: row.translationFallback,
      },
    };
    const sourceSnapshot = typeof row.sourceSnapshotId === "number" ? snapshotMap.get(row.sourceSnapshotId) : undefined;
    candidates.push({ identity: identityFor(row.title, row.link, row.externalId), priority: row.priority, publishedAtMs: row.publishedAt?.getTime() || 0, analysis, compact: { title: row.translatedTitle || row.title, link: row.link, grade: analysis.grade }, raw: { rawPayload: row.rawPayload, sourceSnapshot: sourceSnapshot ? { source: sourceSnapshot.source, url: sourceSnapshot.url, status: sourceSnapshot.status, responseHeaders: sourceSnapshot.responseHeaders, fetchedAt: sourceSnapshot.fetchedAt, rawPayload: sourceSnapshot.rawPayload } : null } });
    sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;
  }

  for (const row of secRows) {
    const gradeCode = getSecSubmissionGrade(row.classifiedScore);
    const company = companyMap.get(row.cik);
    const event = eventMap.get(row.accession);
    const document = documentMap.get(row.accession);
    const companyName = company?.name || row.cik;
    const title = `${row.form} · ${row.primaryDocDescription || companyName}`.trim();
    const analysis: DailyMarketRssAnalysisItem = {
      source: "SEC_SUBMISSIONS",
      sourceType: "SEC_SUBMISSIONS",
      externalId: row.accession,
      sourceSnapshotId: null,
      publishedAt: safeIso(row.acceptanceDateTime, `${row.filingDate}T00:00:00.000Z`),
      titleOriginal: title,
      titleTranslated: null,
      summary: "",
      translatedSummary: null,
      link: row.filingUrl,
      ticker: company?.tickers?.[0] || null,
      company: company?.name || null,
      exchange: company?.exchanges?.[0] || null,
      cik: row.cik,
      form: row.form,
      filingDate: row.filingDate,
      reportDate: row.reportDate,
      acceptanceDateTime: row.acceptanceDateTime,
      primaryDocument: row.primaryDocument,
      primaryDocDescription: row.primaryDocDescription,
      secItems: splitItems(row.items),
      category: row.classifiedCategory || event?.category || "GENERAL",
      grade: MARKET_RSS_GRADE_LABELS[gradeCode],
      gradeCode,
      priority: row.classifiedScore ?? 0,
      score: row.classifiedScore ?? event?.score ?? 0,
      direction: row.classifiedDirection || event?.direction || "UNKNOWN",
      matchedTerms: row.matchedTerms.length ? row.matchedTerms : event?.matchedTerms || [],
      financingAmountUsd: event?.financingAmountUsd ?? null,
      dilutionRisk: event?.dilutionRisk ?? null,
      insiderAction: event?.insiderAction ?? null,
      bodyExcerpt: event?.bodyExcerpt || "",
      translationStatus: null,
      translationFallback: false,
      notificationStatus: event?.discordStatus || null,
      dataQuality: {
        rawPayloadAvailable: Boolean(row.rawPayload),
        fullDocumentAvailable: Boolean(document?.hasFullDocument),
        bodyExcerptAvailable: Boolean(event?.bodyExcerpt),
        translationFallback: false,
      },
    };
    candidates.push({ identity: identityFor(title, row.filingUrl, row.accession), priority: row.classifiedScore ?? 0, publishedAtMs: row.updatedAt?.getTime() || 0, analysis, compact: { title, link: row.filingUrl, grade: analysis.grade }, raw: { rawPayload: row.rawPayload, fullDocument: document?.hasFullDocument ? { indexUrl: document.indexUrl, primaryUrl: document.primaryUrl, indexHtml: document.indexHtml, primaryHtml: document.primaryHtml, primaryText: document.primaryText } : null } });
    sourceCounts.SEC_SUBMISSIONS = (sourceCounts.SEC_SUBMISSIONS || 0) + 1;
  }

  const unique = new Map<string, Candidate>();
  let duplicateCount = 0;
  for (const candidate of candidates) {
    const previous = unique.get(candidate.identity);
    if (!previous) { unique.set(candidate.identity, candidate); continue; }
    duplicateCount += 1;
    if (gradeRank(candidate.analysis.gradeCode) > gradeRank(previous.analysis.gradeCode) || (gradeRank(candidate.analysis.gradeCode) === gradeRank(previous.analysis.gradeCode) && candidate.priority > previous.priority)) unique.set(candidate.identity, candidate);
  }

  const selected = [...unique.values()].sort((left, right) => right.priority - left.priority || right.publishedAtMs - left.publishedAtMs);
  const analysisItems = selected.map((item) => item.analysis);
  const compactItems = selected.map((item) => item.compact);
  const rawItems = options?.includeRaw ? selected.map((item) => ({ ...item.analysis, raw: item.raw })) : undefined;
  const gradeCounts = analysisItems.reduce<Record<string, number>>((counts, item) => { counts[item.grade] = (counts[item.grade] || 0) + 1; return counts; }, {});

  const response: Record<string, unknown> = {
    ok: true,
    date,
    timezone: "Asia/Seoul",
    fields: Object.keys(analysisItems[0] || {}),
    count: analysisItems.length,
    duplicateCount,
    sourceCounts,
    gradeCounts,
    items: analysisItems,
    compactItems,
    ...(rawItems ? { rawItems } : {}),
    rawIncluded: Boolean(options?.includeRaw),
  };
  return response;
}
