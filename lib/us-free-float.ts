import { fetchFmpFreeFloat, type FreeFloatResult } from "@/lib/fmp-free-float";
import { loadFreshFreeFloat, saveFreeFloat } from "@/lib/free-float-repository";

export type UsFreeFloatOverview = FreeFloatResult & { cached: boolean; fetchedAt: Date | null };

/** Reusable use-case: daily DB cache first, then FMP free-tier API. */
export async function getUsFreeFloat(rawTicker: string): Promise<UsFreeFloatOverview> {
  const ticker = rawTicker.trim().toUpperCase();
  try {
    const cached = await loadFreshFreeFloat(ticker);
    if (cached) return { ok: true, ticker, floatShares: cached.floatShares, outstandingShares: cached.outstandingShares, freeFloatPercent: cached.freeFloatPercent, asOf: cached.asOf, source: cached.source as "FMP", status: 200, cached: true, fetchedAt: cached.fetchedAt };
  } catch {
    // A missing migration must not prevent the base ticker query from working.
  }
  const result = await fetchFmpFreeFloat(ticker);
  if (result.ok) {
    try { const saved = await saveFreeFloat(result); return { ...result, cached: false, fetchedAt: saved?.fetchedAt ?? new Date() }; } catch { /* return live result even if cache is unavailable */ }
  }
  return { ...result, cached: false, fetchedAt: null };
}
