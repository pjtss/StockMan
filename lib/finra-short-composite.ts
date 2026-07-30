import type { ShortInterestMetric } from "@/lib/short-interest-types";
import { fetchFreeShortInterest } from "@/lib/short-interest-service";
import { saveShortInterest } from "@/lib/short-interest-repository";

const BASE = "https://api.finra.org/data/group/otcMarket/name";
const num = (v: unknown) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; };
const rows = (value: any): Record<string, unknown>[] => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.results) ? value.results : [];
const tokenHeaders = () => { const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" }; if (process.env.FINRA_API_TOKEN?.trim()) h.Authorization = `Bearer ${process.env.FINRA_API_TOKEN.trim()}`; return h; };
async function query(endpoint: string, fields: string[], ticker: string) {
  const url = process.env[endpoint] || `${BASE}/${endpoint === "FINRA_SHORT_INTEREST_URL" ? "consolidatedShortInterest" : "thresholdList"}`;
  const response = await fetch(url, { method: "POST", headers: tokenHeaders(), body: JSON.stringify({ limit: 100, fields, compareFilters: [{ compareType: "equal", fieldName: endpoint === "FINRA_SHORT_INTEREST_URL" ? "issueSymbolIdentifier" : "issueSymbolIdentifier", fieldValue: ticker }] }), cache: "no-store" });
  if (!response.ok) throw new Error(`FINRA ${endpoint} HTTP ${response.status}`);
  return rows(await response.json());
}

export type FinraComposite = { metric: ShortInterestMetric; shortInterestStatus: string; thresholdStatus: string };

export async function fetchFinraComposite(rawTicker: string): Promise<FinraComposite> {
  const ticker = rawTicker.trim().toUpperCase();
  const metric = await fetchFreeShortInterest(ticker);
  let shortInterestStatus = "NOT_PUBLISHED";
  let thresholdStatus = "NOT_FOUND";
  const [shortInterestResult, thresholdResult] = await Promise.allSettled([
    query("FINRA_SHORT_INTEREST_URL", ["settlementDate", "issueSymbolIdentifier", "currentShortPositionQuantity", "previousShortPositionQuantity", "changePercent", "averageDailyVolumeQuantity", "daysToCoverQuantity"], ticker),
    query("FINRA_THRESHOLD_URL", ["tradeDate", "issueSymbolIdentifier", "thresholdListFlag", "regShoThresholdFlag", "marketClassCode"], ticker),
  ]);
  try {
    if (shortInterestResult.status === "rejected") throw shortInterestResult.reason;
    const data = shortInterestResult.value;
    const row = data[0];
    if (row) {
      const current = num(row.currentShortPositionQuantity ?? row.currentShort ?? row.shortInterest);
      const previous = num(row.previousShortPositionQuantity ?? row.previousShort);
      const average = num(row.averageDailyVolumeQuantity ?? row.averageDailyVolume);
      const change = current != null && previous != null ? current - previous : null;
      const changePercent = num(row.changePercent) ?? (change != null && previous ? change / previous * 100 : null);
      metric.shortInterest = current; metric.previousShortInterest = previous; metric.shortInterestChange = change; metric.shortInterestChangePercent = changePercent; metric.averageDailyVolume = average; metric.daysToCover = num(row.daysToCoverQuantity ?? row.daysToCover) ?? (current != null && average ? current / average : null); metric.asOf = String(row.settlementDate ?? metric.asOf ?? "") || null; metric.status = current == null ? "NULL_FIELD" : "OK"; shortInterestStatus = metric.status;
    }
  } catch (error) { shortInterestStatus = error instanceof Error ? error.message : "API_ERROR"; }
  try {
    if (thresholdResult.status === "rejected") throw thresholdResult.reason;
    const data = thresholdResult.value;
    const row = data[0]; metric.thresholdListed = Boolean(row); metric.thresholdAsOf = row ? String(row.tradeDate ?? "") || null : null; thresholdStatus = row ? "LISTED" : "NOT_FOUND";
  } catch (error) { thresholdStatus = error instanceof Error ? error.message : "API_ERROR"; }
  try { await saveShortInterest(metric); } catch { /* API result remains usable when migration is pending. */ }
  return { metric, shortInterestStatus, thresholdStatus };
}
