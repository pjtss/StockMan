import { fetchFmpFreeFloat, type FreeFloatResult } from "@/lib/fmp-free-float";
import { fetchSecOutstandingShares } from "@/lib/sec-outstanding-shares";
import { loadFreshFreeFloat, saveFreeFloat } from "@/lib/free-float-repository";

export type UsFreeFloatOverview = FreeFloatResult & { cached: boolean; fetchedAt: Date | null };

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
function isStale(asOf: string | null | undefined, now = Date.now()) {
  if (!asOf) return true;
  const parsed = Date.parse(asOf);
  return !Number.isFinite(parsed) || now - parsed > STALE_AFTER_MS;
}

/** Reusable use-case: daily DB cache first, then FMP free-tier API. */
export async function getUsFreeFloat(rawTicker: string, market?: string): Promise<UsFreeFloatOverview> {
  const ticker = rawTicker.trim().toUpperCase();
  try {
    const cached = await loadFreshFreeFloat(ticker);
    if (cached && !(cached.source === "FMP" && isStale(cached.asOf))) return { ok: true, ticker, floatShares: cached.floatShares, outstandingShares: cached.outstandingShares, freeFloatPercent: cached.freeFloatPercent, asOf: cached.asOf, source: cached.source as "FMP" | "SEC", status: 200, dataType: cached.source === "FMP" ? "FREE_FLOAT" : "OUTSTANDING_SHARES", cached: true, fetchedAt: cached.fetchedAt };
  } catch {
    // A missing migration must not prevent the base ticker query from working.
  }
  const result = await fetchFmpFreeFloat(ticker);
  const fallbackReason = result.ok ? "FMP_STALE_OVER_30_DAYS" as const : "FMP_UNAVAILABLE" as const;
  if (result.ok && !isStale(result.asOf)) {
    try { const saved = await saveFreeFloat(result); return { ...result, cached: false, fetchedAt: saved?.fetchedAt ?? new Date() }; } catch { /* return live result even if cache is unavailable */ }
  }
  const sec = await fetchSecOutstandingShares(ticker, market).catch(() => null);
  return { ...(sec?.ok ? sec : { ...result, ok: false, error: result.ok ? "FMP free-float data is older than 30 days and SEC fallback was unavailable" : result.error }), fallbackReason, cached: false, fetchedAt: null };
}

/** Forces a live provider refresh. A failed refresh never replaces a valid DB snapshot. */
export async function refreshUsFreeFloat(rawTicker: string, market?: string): Promise<UsFreeFloatOverview> {
  const ticker = rawTicker.trim().toUpperCase();
  const result = await fetchFmpFreeFloat(ticker);
  const fallbackReason = result.ok ? "FMP_STALE_OVER_30_DAYS" as const : "FMP_UNAVAILABLE" as const;
  if (result.ok && !isStale(result.asOf)) {
    try { const saved = await saveFreeFloat(result); return { ...result, cached: false, fetchedAt: saved?.fetchedAt ?? new Date() }; } catch { return { ...result, cached: false, fetchedAt: new Date() }; }
  }
  const sec = await fetchSecOutstandingShares(ticker, market).catch(() => null);
  return { ...(sec?.ok ? sec : { ...result, ok: false, error: result.ok ? "FMP free-float data is older than 30 days and SEC fallback was unavailable" : result.error }), fallbackReason, cached: false, fetchedAt: null };
}
