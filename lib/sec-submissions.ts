import { fetchSecJson, submissionsUrl, type SecHttpResult } from "./sec-edgar-client";

export type SecSubmissionRow = { accession: string; filingDate: string; reportDate?: string; form: string; primaryDocument: string; primaryDocDescription?: string; fileNumber?: string; items?: string; acceptanceDateTime?: string; isXbrl?: number; isInlineXbrl?: number };
export type SecSubmissions = { cik: string; name: string; tickers: string[]; exchanges: string[]; sic?: string; filings: SecSubmissionRow[]; source: SecHttpResult<unknown> };

export async function fetchSecSubmissions(cik: string): Promise<SecSubmissions> {
  const normalized = cik.replace(/\D/g, "").padStart(10, "0");
  const source = await fetchSecJson<Record<string, any>>(submissionsUrl(normalized));
  if (!source.ok) return { cik: normalized, name: "", tickers: [], exchanges: [], filings: [], source };
  const body = source.data;
  const recent = body.filings?.recent || {};
  const keys = Object.keys(recent);
  const length = Math.max(0, ...keys.map((key) => Array.isArray(recent[key]) ? recent[key].length : 0));
  const filings = Array.from({ length }, (_, index) => ({
    accession: String(recent.accessionNumber?.[index] || ""), filingDate: String(recent.filingDate?.[index] || ""), reportDate: String(recent.reportDate?.[index] || "") || undefined,
    form: String(recent.form?.[index] || ""), primaryDocument: String(recent.primaryDocument?.[index] || ""), primaryDocDescription: String(recent.primaryDocDescription?.[index] || "") || undefined,
    fileNumber: String(recent.fileNumber?.[index] || "") || undefined, items: String(recent.items?.[index] || "") || undefined, acceptanceDateTime: String(recent.acceptanceDateTime?.[index] || "") || undefined,
    isXbrl: Number(recent.isXBRL?.[index] || 0), isInlineXbrl: Number(recent.isInlineXBRL?.[index] || 0),
  })).filter((row) => row.accession && row.form);
  return { cik: normalized, name: String(body.name || ""), tickers: Array.isArray(body.tickers) ? body.tickers.map(String) : [], exchanges: Array.isArray(body.exchanges) ? body.exchanges.map(String) : [], sic: String(body.sic || "") || undefined, filings, source };
}
