import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketRssArticles, secCompanies, secSubmissions } from "@/lib/schema";
import { getMarketRssGrade, MARKET_RSS_GRADE_LABELS, type MarketRssGrade } from "@/lib/market-rss-grade";

export type DailyMarketRssCopyItem = {
  title: string;
  link: string;
  grade: string;
};

type Candidate = DailyMarketRssCopyItem & {
  identity: string;
  gradeCode: MarketRssGrade;
  priority: number;
  publishedAtMs: number;
  source: string;
};

export function getSecSubmissionGrade(score: number | null | undefined): MarketRssGrade {
  const value = Number(score ?? 0);
  if (value >= 70) return "high";
  if (value >= 50) return "medium";
  if (value > 0) return "low";
  return "excluded";
}

function kstDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const start = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new Error("invalid date");
  return { start, end: new Date(start.getTime() + 86_400_000) };
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

function toCandidate(input: Omit<Candidate, "grade"> & { gradeCode: MarketRssGrade }): Candidate {
  return { ...input, grade: MARKET_RSS_GRADE_LABELS[input.gradeCode] };
}

export async function loadDailyMarketRssExport(date: string) {
  const { start, end } = kstDayBounds(date);
  const db = getDb();
  const [rssRows, secRows, companies] = await Promise.all([
    db.select().from(marketRssArticles).where(and(gte(marketRssArticles.publishedAt, start), lt(marketRssArticles.publishedAt, end))).orderBy(desc(marketRssArticles.priority), desc(marketRssArticles.publishedAt)),
    db.select().from(secSubmissions).where(eq(secSubmissions.filingDate, date)).orderBy(desc(secSubmissions.classifiedScore), desc(secSubmissions.updatedAt)),
    db.select({ cik: secCompanies.cik, name: secCompanies.name }).from(secCompanies),
  ]);
  const companyNames = new Map(companies.map((company) => [company.cik, company.name]));
  const candidates: Candidate[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const row of rssRows) {
    const gradeCode = getMarketRssGrade(row);
    const title = (row.translatedTitle || row.title || "").trim();
    const link = (row.link || "").trim();
    candidates.push(toCandidate({ title, link, gradeCode, identity: identityFor(title, link, row.externalId), priority: row.priority, publishedAtMs: row.publishedAt?.getTime() || 0, source: row.source }));
    sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;
  }

  for (const row of secRows) {
    const gradeCode = getSecSubmissionGrade(row.classifiedScore);
    const company = companyNames.get(row.cik) || row.cik;
    const title = `${row.form} · ${row.primaryDocDescription || company}`.trim();
    const link = row.filingUrl.trim();
    candidates.push(toCandidate({ title, link, gradeCode, identity: identityFor(title, link, row.accession), priority: row.classifiedScore ?? 0, publishedAtMs: row.updatedAt?.getTime() || 0, source: "SEC_SUBMISSIONS" }));
    sourceCounts.SEC_SUBMISSIONS = (sourceCounts.SEC_SUBMISSIONS || 0) + 1;
  }

  const unique = new Map<string, Candidate>();
  let duplicateCount = 0;
  for (const candidate of candidates) {
    const previous = unique.get(candidate.identity);
    if (!previous) {
      unique.set(candidate.identity, candidate);
      continue;
    }
    duplicateCount += 1;
    const previousRank = previous.gradeCode === "high" ? 3 : previous.gradeCode === "medium" ? 2 : previous.gradeCode === "low" ? 1 : 0;
    const nextRank = candidate.gradeCode === "high" ? 3 : candidate.gradeCode === "medium" ? 2 : candidate.gradeCode === "low" ? 1 : 0;
    if (nextRank > previousRank || (nextRank === previousRank && candidate.priority > previous.priority)) unique.set(candidate.identity, candidate);
  }

  const items = [...unique.values()]
    .sort((left, right) => right.priority - left.priority || right.publishedAtMs - left.publishedAtMs)
    .map(({ title, link, grade }) => ({ title, link, grade }));
  const gradeCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.grade] = (counts[item.grade] || 0) + 1;
    return counts;
  }, {});

  return {
    ok: true as const,
    date,
    timezone: "Asia/Seoul",
    fields: ["title", "link", "grade"] as const,
    count: items.length,
    duplicateCount,
    sourceCounts,
    gradeCounts,
    items,
  };
}
