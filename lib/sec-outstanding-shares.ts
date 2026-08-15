import { companyFactsUrl, fetchSecJson } from "@/lib/sec-edgar-client";
import { resolveSecTicker } from "@/lib/sec-company-ticker";
import type { FreeFloatResult } from "@/lib/fmp-free-float";

type Facts = { facts?: { "us-gaap"?: Record<string, { units?: Record<string, Array<Record<string, unknown>>> }> } };

/**
 * SEC fallback for the latest issuer-reported outstanding shares.
 * This is deliberately not labelled free float: SEC XBRL does not guarantee
 * a standardized float field for every issuer.
 */
export async function fetchSecOutstandingShares(rawTicker: string): Promise<FreeFloatResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const mapping = await resolveSecTicker(ticker);
  if (!mapping) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: 404, error: "SEC ticker mapping not found" };
  const response = await fetchSecJson<Facts>(companyFactsUrl(mapping.cik));
  if (!response.ok) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: response.status, error: response.error };
  const concept = response.data.facts?.["us-gaap"]?.EntityCommonStockSharesOutstanding;
  const rows = Object.values(concept?.units || {}).flat().filter((row) => Number.isFinite(Number(row.val)) && row.end).sort((a, b) => String(b.end).localeCompare(String(a.end)));
  const latest = rows[0];
  const outstandingShares = latest ? Number(latest.val) : null;
  if (outstandingShares == null) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", status: 200, error: "SEC outstanding shares fact not found" };
  return { ok: true, ticker, floatShares: null, outstandingShares, freeFloatPercent: null, asOf: String(latest.end), source: "SEC", status: response.status };
}
