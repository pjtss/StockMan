export type FreeFloatResult = {
  ok: boolean;
  ticker: string;
  floatShares: number | null;
  outstandingShares: number | null;
  freeFloatPercent: number | null;
  asOf: string | null;
  source: "FMP" | "SEC";
  dataType?: "FREE_FLOAT" | "OUTSTANDING_SHARES";
  fallbackReason?: "FMP_UNAVAILABLE" | "FMP_STALE_OVER_30_DAYS";
  sourceUrl?: string;
  status: number | null;
  error?: string;
};

const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Fetches one US ticker's public float from FMP's free-tier endpoint. */
export async function fetchFmpFreeFloat(rawTicker: string): Promise<FreeFloatResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const apiKey = process.env.FMP_API_KEY?.trim();
  if (!apiKey) return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "FMP", status: null, error: "FMP_API_KEY is not configured" };
  try {
    const url = `https://financialmodelingprep.com/stable/shares-float?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    const raw = await response.json().catch(() => null) as any;
    const row = Array.isArray(raw) ? raw[0] : raw?.data?.[0] ?? raw;
    const floatShares = numberValue(row?.floatShares ?? row?.float_shares ?? row?.freeFloat);
    const outstandingShares = numberValue(row?.outstandingShares ?? row?.outstanding_shares ?? row?.sharesOutstanding);
    const freeFloatPercent = numberValue(row?.freeFloatPercent ?? row?.free_float_percent ?? row?.freeFloatPercentage) ?? (floatShares != null && outstandingShares ? floatShares / outstandingShares * 100 : null);
    const asOf = String(row?.date ?? row?.asOf ?? row?.as_of ?? "").trim() || null;
    return { ok: response.ok && floatShares != null, ticker, floatShares, outstandingShares, freeFloatPercent, asOf, source: "FMP", dataType: "FREE_FLOAT", status: response.status, ...(response.ok ? {} : { error: `FMP HTTP ${response.status}` }) };
  } catch (error) {
    return { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "FMP", status: null, error: error instanceof Error ? error.message : String(error) };
  }
}
