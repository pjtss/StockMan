import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { secCompanies, secFilingDocuments, secFilingEvents, secSubmissions, secXbrlSnapshots } from "./schema";
import { fetchSecSubmissions, type SecSubmissionRow } from "./sec-submissions";
import { classifySecEvent } from "./sec-event-classifier";
import { fetchSecJson, companyFactsUrl } from "./sec-edgar-client";
import { fetchSecPrimaryDocument } from "./sec-primary-document";
import { analyzeSecFinancing } from "./sec-financing-analyzer";
import { analyzeSecInsider } from "./sec-insider-analysis";
import { archiveSecFilingDocument, archiveSecSourceSnapshot } from "./source-payload-archive";

export function secFilingUrl(cik: string, accession: string, primaryDocument: string) { return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${primaryDocument}`; }

export async function syncSecCompany(cik: string) {
  const result = await fetchSecSubmissions(cik);
  if (!result.source.ok) return { ok: false, cik: result.cik, error: result.source.error, status: result.source.status, source: result.source, submissions: 0, inserted: 0 };
  await archiveSecSourceSnapshot({ sourceType: "SUBMISSIONS", sourceKey: result.cik, url: result.source.url, status: result.source.status, responseHeaders: result.source.responseHeaders, rawPayload: result.source.rawText, fetchedAt: result.source.fetchedAt });
  const db = getDb();
  await db.insert(secCompanies).values({ cik: result.cik, name: result.name, tickers: result.tickers, exchanges: result.exchanges, sic: result.sic || null, sourceUpdatedAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: secCompanies.cik, set: { name: result.name, tickers: result.tickers, exchanges: result.exchanges, sic: result.sic || null, sourceUpdatedAt: new Date(), updatedAt: new Date() } });
  let inserted = 0;
  for (const row of result.filings) {
    const classification = classifySecEvent({ form: row.form, items: row.items });
    const values = { accession: row.accession, cik: result.cik, form: row.form, filingDate: row.filingDate, reportDate: row.reportDate || null, primaryDocument: row.primaryDocument, primaryDocDescription: row.primaryDocDescription || null, items: row.items || null, acceptanceDateTime: row.acceptanceDateTime || null, filingUrl: secFilingUrl(result.cik, row.accession, row.primaryDocument), rawPayload: row as unknown as Record<string, unknown>, classifiedCategory: classification.category, classifiedDirection: classification.direction, classifiedScore: classification.score, matchedTerms: classification.matchedTerms, updatedAt: new Date() };
    const rows = await db.insert(secSubmissions).values(values).onConflictDoUpdate({ target: secSubmissions.accession, set: { form: values.form, filingDate: values.filingDate, reportDate: values.reportDate, primaryDocument: values.primaryDocument, primaryDocDescription: values.primaryDocDescription, items: values.items, acceptanceDateTime: values.acceptanceDateTime, filingUrl: values.filingUrl, rawPayload: values.rawPayload, classifiedCategory: values.classifiedCategory, classifiedDirection: values.classifiedDirection, classifiedScore: values.classifiedScore, matchedTerms: values.matchedTerms, updatedAt: new Date() } }).returning({ accession: secSubmissions.accession });
    inserted += rows.length;
    await db.insert(secFilingEvents).values({ accession: row.accession, cik: result.cik, category: classification.category, direction: classification.direction, score: classification.score, matchedTerms: classification.matchedTerms, updatedAt: new Date() }).onConflictDoUpdate({ target: secFilingEvents.accession, set: { category: classification.category, direction: classification.direction, score: classification.score, matchedTerms: classification.matchedTerms, updatedAt: new Date() } });
  }
  return { ok: true, cik: result.cik, company: result.name, source: { ok: true, status: result.source.status, url: result.source.url, fetchedAt: result.source.fetchedAt, responseHeaders: result.source.responseHeaders }, submissions: result.filings.length, inserted };
}

export async function syncSecCompanyFacts(cik: string) {
  const source = await fetchSecJson<Record<string, unknown>>(companyFactsUrl(cik));
  if (!source.ok) return { ok: false, cik, status: source.status, error: source.error };
  await archiveSecSourceSnapshot({ sourceType: "COMPANY_FACTS", sourceKey: cik.replace(/\D/g, "").padStart(10, "0"), url: source.url, status: source.status, responseHeaders: source.responseHeaders, rawPayload: source.rawText, fetchedAt: source.fetchedAt });
  await getDb().insert(secXbrlSnapshots).values({ cik: cik.replace(/\D/g, "").padStart(10, "0"), payload: source.data, fetchedAt: new Date() }).onConflictDoUpdate({ target: secXbrlSnapshots.cik, set: { payload: source.data, fetchedAt: new Date() } });
  return { ok: true, cik, status: source.status, fetchedAt: source.fetchedAt, factCount: Object.keys((source.data as any).facts || {}).length };
}

export async function loadSecSubmission(accession: string) { const rows = await getDb().select().from(secSubmissions).where(eq(secSubmissions.accession, accession)).limit(1); return rows[0] || null; }
export async function loadRecentSecSubmissions(limit = 50) { return getDb().select().from(secSubmissions).orderBy(desc(secSubmissions.filingDate), desc(secSubmissions.createdAt)).limit(limit); }
export async function loadPendingSecEvents(limit = 20) { return getDb().select().from(secFilingEvents).where(eq(secFilingEvents.discordStatus, "PENDING")).orderBy(desc(secFilingEvents.score), desc(secFilingEvents.updatedAt)).limit(limit); }
export async function markSecEventDiscord(accession: string, status: string, error?: string) { await getDb().update(secFilingEvents).set({ discordStatus: status, discordSentAt: status === "SENT" ? new Date() : undefined, lastError: error || null, updatedAt: new Date() }).where(eq(secFilingEvents.accession, accession)); }

export async function analyzeSecSubmission(accession: string) {
  const row = await loadSecSubmission(accession);
  if (!row) return { ok: false, accession, error: "submission_not_found" };
  try {
    const cachedDocuments = await getDb().select().from(secFilingDocuments).where(eq(secFilingDocuments.accession, accession)).limit(1);
    if (cachedDocuments[0]?.primaryText) {
      const cached = cachedDocuments[0];
      const financing = analyzeSecFinancing(cached.primaryText);
      const insider = analyzeSecInsider(cached.primaryText);
      await getDb().update(secFilingEvents).set({ bodyExcerpt: cached.primaryText.slice(0, 12000), financingAmountUsd: financing.amountUsd, dilutionRisk: financing.dilutionRisk, insiderAction: insider.action, updatedAt: new Date() }).where(eq(secFilingEvents.accession, accession));
      return { ok: true, cached: true, accession, url: cached.primaryUrl, financing, insider, excerpt: cached.primaryText.slice(0, 12000) };
    }
    const document = await fetchSecPrimaryDocument({ source: "SEC", accession: row.accession, company: row.cik, formType: row.form, sentiment: "중요공시", publishedAt: `${row.filingDate}T00:00:00Z`, title: row.primaryDocDescription || row.form, summary: "", link: row.filingUrl });
    const text = document.document.text || document.document.html || "";
    const financing = analyzeSecFinancing(text);
    const insider = analyzeSecInsider(text);
    await archiveSecFilingDocument({
      accession: row.accession,
      cik: row.cik,
      form: row.form,
      indexUrl: document.indexUrl,
      primaryUrl: document.urlInfo.canonicalUrl,
      indexHtml: document.indexDocument.html,
      primaryHtml: document.document.html,
      primaryText: text,
      fetchedAt: new Date().toISOString(),
    });
    await getDb().update(secFilingEvents).set({ bodyExcerpt: text.slice(0, 12000), financingAmountUsd: financing.amountUsd, dilutionRisk: financing.dilutionRisk, insiderAction: insider.action, updatedAt: new Date() }).where(eq(secFilingEvents.accession, accession));
    return { ok: true, accession, url: document.urlInfo.canonicalUrl, financing, insider, excerpt: text.slice(0, 12000) };
  } catch (error) { return { ok: false, accession, error: error instanceof Error ? error.message : String(error) }; }
}
export async function loadSecTickerSnapshot(ticker: string) {
  const value = ticker.toUpperCase();
  const companies = await getDb().select().from(secCompanies);
  const company = companies.find((row) => row.tickers.includes(value));
  if (!company) return null;
  const submissions = await getDb().select().from(secSubmissions).where(eq(secSubmissions.cik, company.cik)).orderBy(desc(secSubmissions.filingDate), desc(secSubmissions.createdAt)).limit(20);
  const events = await getDb().select().from(secFilingEvents).where(eq(secFilingEvents.cik, company.cik)).orderBy(desc(secFilingEvents.updatedAt)).limit(20);
  const facts = await getDb().select().from(secXbrlSnapshots).where(eq(secXbrlSnapshots.cik, company.cik)).limit(1);
  return { company, submissions, events, facts: facts[0] || null };
}
