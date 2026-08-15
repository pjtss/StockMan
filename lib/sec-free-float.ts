import { resolveSecTickerCandidates, selectPreferredSecCompanyTicker } from "@/lib/sec-company-ticker";
import { fetchSecJson, submissionsUrl } from "@/lib/sec-edgar-client";
import { createSecRequestHeaders } from "@/lib/sec-request-headers";
import type { FreeFloatResult } from "@/lib/fmp-free-float";

type Submissions = { filings?: { recent?: Record<string, unknown[]> } };

const n = (value: string) => {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function documentUrl(cik: string, accession: string, document: string) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${document}`;
}

function extractExplicitFloat(text: string) {
  const normalized = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  const patterns = [
    /public\s+float(?:\s+of|\s*[:])?\s*([0-9,]+)\s+shares?/i,
    /([0-9,]+)\s+shares?\s+(?:held\s+by|owned\s+by)\s+(?:non[-\s]?affiliates|nonaffiliates)/i,
    /(?:non[-\s]?affiliates|nonaffiliates)[^0-9]{0,120}([0-9,]+)\s+shares?/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const shares = match?.[1] ? n(match[1]) : null;
    if (shares != null && shares > 0) return shares;
  }
  return null;
}

/** Extracts free float only when a SEC filing explicitly states share count. */
export async function fetchSecFreeFloat(rawTicker: string, preferredMarket?: string): Promise<FreeFloatResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const candidates = await resolveSecTickerCandidates(ticker);
  const market = preferredMarket?.toUpperCase() === "NAS" ? "NASDAQ" : preferredMarket?.toUpperCase() === "NYS" ? "NYSE" : preferredMarket?.toUpperCase() === "AMS" ? "NYSE AMERICAN" : undefined;
  const marketCandidates = market ? candidates.filter((row) => row.exchange.toUpperCase() === market) : candidates;
  const mapping = selectPreferredSecCompanyTicker(marketCandidates.length ? marketCandidates : candidates);
  if (!mapping) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", dataType: "FREE_FLOAT", status: 404, error: "SEC common-share mapping not found" };
  const submission = await fetchSecJson<Submissions>(submissionsUrl(mapping.cik));
  if (!submission.ok) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", dataType: "FREE_FLOAT", status: submission.status, error: submission.error };
  const recent = submission.data.filings?.recent;
  if (!recent) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", dataType: "FREE_FLOAT", status: 200, error: "SEC recent filings unavailable" };
  const forms = recent.form || [];
  const dates = recent.filingDate || [];
  const accessions = recent.accessionNumber || [];
  const documents = recent.primaryDocument || [];
  let inspected = 0;
  for (let index = 0; index < forms.length && inspected < 6; index += 1) {
    if (!(forms[index] === "10-K" || forms[index] === "10-Q" || forms[index] === "S-1" || forms[index] === "S-1/A")) continue;
    const accession = String(accessions[index] || "");
    const document = String(documents[index] || "");
    if (!accession || !document) continue;
    inspected += 1;
    const url = documentUrl(mapping.cik, accession, document);
    try {
      const response = await fetch(url, { headers: createSecRequestHeaders("text/html"), cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const shares = extractExplicitFloat(await response.text());
      if (shares == null) continue;
      return { ok: true, ticker, floatShares: shares, outstandingShares: null, freeFloatPercent: null, asOf: String(dates[index] || "") || null, source: "SEC", dataType: "FREE_FLOAT", sourceUrl: url, status: response.status };
    } catch {
      // Continue to the next recent filing; one unavailable document is not fatal.
    }
  }
  return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", dataType: "FREE_FLOAT", status: 200, error: "SEC filings contain no explicit free-float share count" };
}
