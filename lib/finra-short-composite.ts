import type { ShortInterestMetric } from "@/lib/short-interest-types";
import { fetchFreeShortInterest } from "@/lib/short-interest-service";
import { saveShortInterest } from "@/lib/short-interest-repository";
import { fetchNasdaqShortInterest } from "@/lib/nasdaq-short-interest";

const BASE = "https://api.finra.org/data/group/otcMarket/name";
const num = (v: unknown) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; };
const rows = (value: any): Record<string, unknown>[] => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.results) ? value.results : [];
const tokenHeaders = () => { const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" }; if (process.env.FINRA_API_TOKEN?.trim()) h.Authorization = `Bearer ${process.env.FINRA_API_TOKEN.trim()}`; return h; };
async function query(endpoint: string, fields: string[], ticker: string, symbolField: string) {
  const url = process.env[endpoint] || `${BASE}/${endpoint === "FINRA_SHORT_INTEREST_URL" ? "consolidatedShortInterest" : "thresholdList"}`;
  const response = await fetch(url, { method: "POST", headers: tokenHeaders(), body: JSON.stringify({ limit: 100, fields, compareFilters: [{ compareType: "equal", fieldName: symbolField, fieldValue: ticker }] }), cache: "no-store" });
  if (!response.ok) throw new Error(`FINRA ${endpoint} HTTP ${response.status}`);
  return rows(await response.json());
}

export type FinraComposite = { metric: ShortInterestMetric; shortInterestStatus: string; thresholdStatus: string; fallback?: { source: string; ok: boolean; raw?: unknown; error?: string } };

export async function fetchFinraComposite(rawTicker: string): Promise<FinraComposite> {
  const ticker = rawTicker.trim().toUpperCase();
  const metric = await fetchFreeShortInterest(ticker);
  let shortInterestStatus = "NOT_PUBLISHED";
  let thresholdStatus = "NOT_FOUND";
  const [shortInterestResult, thresholdResult] = await Promise.allSettled([
    query("FINRA_SHORT_INTEREST_URL", ["settlementDate", "symbolCode", "currentShortPositionQuantity", "previousShortPositionQuantity", "changePreviousNumber", "changePercent", "averageDailyVolumeQuantity", "daysToCoverQuantity"], ticker, "symbolCode"),
    query("FINRA_THRESHOLD_URL", ["tradeDate", "issueSymbolIdentifier", "thresholdListFlag", "regShoThresholdFlag", "marketClassCode"], ticker, "issueSymbolIdentifier"),
  ]);
  try {
    if (shortInterestResult.status === "rejected") throw shortInterestResult.reason;
    const data = shortInterestResult.value;
    const row = data[0];
    if (row) {
      const current = num(row.currentShortPositionQuantity ?? row.currentShort ?? row.shortInterest);
      const previous = num(row.previousShortPositionQuantity ?? row.previousShort);
      const average = num(row.averageDailyVolumeQuantity ?? row.averageDailyVolume);
      const change = num(row.changePreviousNumber) ?? (current != null && previous != null ? current - previous : null);
      const changePercent = num(row.changePercent) ?? (change != null && previous ? change / previous * 100 : null);
      const shortInterestAsOf = String(row.settlementDate ?? "").trim() || null;
      metric.shortInterest = current; metric.previousShortInterest = previous; metric.shortInterestChange = change; metric.shortInterestChangePercent = changePercent; metric.averageDailyVolume = average; metric.daysToCover = num(row.daysToCoverQuantity ?? row.daysToCover) ?? (current != null && average ? current / average : null); metric.shortInterestAsOf = shortInterestAsOf; metric.status = current == null ? "NULL_FIELD" : "OK"; shortInterestStatus = metric.status;
      if (shortInterestAsOf) {
        const ageDays = (Date.now() - Date.parse(shortInterestAsOf)) / 86_400_000;
        if (Number.isFinite(ageDays) && ageDays > 45) shortInterestStatus = "STALE";
      }
    }
  } catch (error) { shortInterestStatus = error instanceof Error ? error.message : "API_ERROR"; }
  let fallback: FinraComposite["fallback"];
  if (metric.shortInterest == null || shortInterestStatus === "STALE" || shortInterestStatus === "NOT_PUBLISHED") {
    const nasdaq = await fetchNasdaqShortInterest(ticker);
    fallback = { source: "NASDAQ", ok: nasdaq.ok, raw: nasdaq.raw, error: nasdaq.error };
    if (nasdaq.ok && nasdaq.shortInterest != null) {
      metric.shortInterest = nasdaq.shortInterest;
      metric.averageDailyVolume = nasdaq.averageDailyVolume;
      metric.daysToCover = nasdaq.daysToCover;
      metric.shortInterestAsOf = nasdaq.asOf;
      metric.source = "NASDAQ";
      metric.status = "OK";
      shortInterestStatus = "NASDAQ_FALLBACK";
    }
  }
  try {
    if (thresholdResult.status === "rejected") throw thresholdResult.reason;
    const data = thresholdResult.value;
    const row = data[0]; metric.thresholdListed = Boolean(row); metric.thresholdAsOf = row ? String(row.tradeDate ?? "") || null : null; thresholdStatus = row ? "LISTED" : "NOT_FOUND";
  } catch (error) { thresholdStatus = error instanceof Error ? error.message : "API_ERROR"; }
  try { await saveShortInterest(metric); } catch { /* API result remains usable when migration is pending. */ }
  return { metric, shortInterestStatus, thresholdStatus, fallback };
}
