import { fetchSecJson, submissionsUrl, type SecHttpResult } from "./sec-edgar-client";

export type SecSubmissionRow = { accession: string; filingDate: string; reportDate?: string; form: string; primaryDocument: string; primaryDocDescription?: string; fileNumber?: string; items?: string; acceptanceDateTime?: string; isXbrl?: number; isInlineXbrl?: number };
export type SecSubmissions = { cik: string; name: string; tickers: string[]; exchanges: string[]; sic?: string; filings: SecSubmissionRow[]; source: SecHttpResult<unknown> };

type SubmissionPayload = Record<string, any>;

function rowsFromColumnar(source: SubmissionPayload) {
  const keys = Object.keys(source);
  const length = Math.max(0, ...keys.map((key) => Array.isArray(source[key]) ? source[key].length : 0));
  return Array.from({ length }, (_, index) => ({
    accession: String(source.accessionNumber?.[index] || ""), filingDate: String(source.filingDate?.[index] || ""), reportDate: String(source.reportDate?.[index] || "") || undefined,
    form: String(source.form?.[index] || ""), primaryDocument: String(source.primaryDocument?.[index] || ""), primaryDocDescription: String(source.primaryDocDescription?.[index] || "") || undefined,
    fileNumber: String(source.fileNumber?.[index] || "") || undefined, items: String(source.items?.[index] || "") || undefined, acceptanceDateTime: String(source.acceptanceDateTime?.[index] || "") || undefined,
    isXbrl: Number(source.isXBRL?.[index] || 0), isInlineXbrl: Number(source.isInlineXBRL?.[index] || 0),
  } satisfies SecSubmissionRow)).filter((row) => row.accession && row.form && row.filingDate);
}

/** Fetches the complete filing history, including the additional JSON files listed by SEC. */
export async function fetchAllSecSubmissions(cik: string): Promise<SecSubmissions> {
  const normalized = cik.replace(/\D/g, "").padStart(10, "0");
  const source = await fetchSecJson<SubmissionPayload>(submissionsUrl(normalized));
  if (!source.ok) return { cik: normalized, name: "", tickers: [], exchanges: [], filings: [], source };
  const body = source.data;
  const filings = [...rowsFromColumnar(body.filings?.recent || {})];
  const files = Array.isArray(body.filings?.files) ? body.filings.files : [];
  for (const file of files) {
    const name = typeof file?.name === "string" ? file.name : "";
    if (!name) continue;
    const extra = await fetchSecJson<SubmissionPayload>(`/submissions/${name}`);
    if (extra.ok) filings.push(...rowsFromColumnar(extra.data));
  }
  const unique = new Map<string, SecSubmissionRow>();
  for (const row of filings) unique.set(row.accession, row);
  return { cik: normalized, name: String(body.name || ""), tickers: Array.isArray(body.tickers) ? body.tickers.map(String) : [], exchanges: Array.isArray(body.exchanges) ? body.exchanges.map(String) : [], sic: String(body.sic || "") || undefined, filings: [...unique.values()], source };
}

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
