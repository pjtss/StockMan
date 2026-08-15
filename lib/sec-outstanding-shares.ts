import { companyFactsUrl, fetchSecJson } from "@/lib/sec-edgar-client";
import { resolveSecTickerCandidates, selectPreferredSecCompanyTicker } from "@/lib/sec-company-ticker";
import type { FreeFloatResult } from "@/lib/fmp-free-float";

type Facts = { facts?: { "us-gaap"?: Record<string, { units?: Record<string, Array<Record<string, unknown>>> }> } };

/**
 * SEC fallback for the latest issuer-reported outstanding shares.
 * This is deliberately not labelled free float: SEC XBRL does not guarantee
 * a standardized float field for every issuer.
 */
function normalizeMarket(value: string | undefined) {
  const upper = value?.trim().toUpperCase();
  return upper === "NAS" ? "NASDAQ" : upper === "NYS" ? "NYSE" : upper === "AMS" ? "NYSE AMERICAN" : upper;
}

export async function fetchSecOutstandingShares(rawTicker: string, preferredMarket?: string): Promise<FreeFloatResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const candidates = await resolveSecTickerCandidates(ticker);
  const normalizedMarket = normalizeMarket(preferredMarket);
  const marketCandidates = normalizedMarket ? candidates.filter((candidate) => normalizeMarket(candidate.exchange) === normalizedMarket) : candidates;
  const mapping = selectPreferredSecCompanyTicker(marketCandidates.length ? marketCandidates : candidates);
  if (!mapping) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: 404, error: "SEC ticker mapping not found" };
  const response = await fetchSecJson<Facts>(companyFactsUrl(mapping.cik));
  if (!response.ok) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: response.status, error: response.error };
  const usGaap = response.data.facts?.["us-gaap"] || {};
  const concepts = ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"]
    .map((tag) => usGaap[tag])
    .filter(Boolean);
  const rows = concepts.flatMap((concept) => Object.values(concept?.units || {}).flat())
    .filter((row) => Number.isFinite(Number(row.val)) && row.end)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  const latest = rows[0];
  const outstandingShares = latest ? Number(latest.val) : null;
  if (outstandingShares == null) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: 200, error: "SEC outstanding shares fact not found" };
  return { ok: true, ticker, floatShares: null, outstandingShares, freeFloatPercent: null, asOf: String(latest.end), source: "SEC", dataType: "OUTSTANDING_SHARES", status: response.status };
}
