import { fetchFmpFreeFloat, type FreeFloatResult } from "@/lib/fmp-free-float";
import { fetchSecOutstandingShares } from "@/lib/sec-outstanding-shares";
import { fetchSecFreeFloat } from "@/lib/sec-free-float";
import { deleteFreeFloat, loadLatestFreeFloat, saveFreeFloat } from "@/lib/free-float-repository";

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
    const cached = await loadLatestFreeFloat(ticker);
    if (cached && !isStale(cached.asOf ?? cached.fetchedAt?.toISOString())) return { ok: true, ticker, floatShares: cached.floatShares, outstandingShares: cached.outstandingShares, freeFloatPercent: cached.freeFloatPercent, asOf: cached.asOf, source: cached.source as "FMP" | "SEC", status: 200, dataType: cached.source === "SEC" && cached.outstandingShares != null ? "OUTSTANDING_SHARES" : "FREE_FLOAT", cached: true, fetchedAt: cached.fetchedAt };
    if (cached) await deleteFreeFloat(ticker);
  } catch {
    // A missing migration must not prevent the base ticker query from working.
  }
  const result = await fetchFmpFreeFloat(ticker);
  const fallbackReason = result.ok ? "FMP_STALE_OVER_30_DAYS" as const : "FMP_UNAVAILABLE" as const;
  if (result.ok && !isStale(result.asOf)) {
    try { const saved = await saveFreeFloat(result); return { ...result, cached: false, fetchedAt: saved?.fetchedAt ?? new Date() }; } catch { /* return live result even if cache is unavailable */ }
  }
  const secFloat = await fetchSecFreeFloat(ticker, market).catch(() => null);
  const sec = secFloat?.ok ? null : await fetchSecOutstandingShares(ticker, market).catch(() => null);
  const selected = secFloat?.ok ? secFloat : sec?.ok ? sec : { ...result, ok: false, error: result.ok ? "FMP free-float data is older than 30 days and SEC fallback was unavailable" : result.error };
  if (selected.ok) { try { await saveFreeFloat(selected); } catch { /* the live fallback remains usable */ } }
  return { ...selected, fallbackReason, cached: false, fetchedAt: null };
}

/** Forces a live provider refresh. A failed refresh never replaces a valid DB snapshot. */
export async function refreshUsFreeFloat(rawTicker: string, market?: string): Promise<UsFreeFloatOverview> {
  const ticker = rawTicker.trim().toUpperCase();
  // Manual refresh follows the same destructive stale-cache policy.
  try { await deleteFreeFloat(ticker); } catch { /* provider refresh can still proceed */ }
  const result = await fetchFmpFreeFloat(ticker);
  const fallbackReason = result.ok ? "FMP_STALE_OVER_30_DAYS" as const : "FMP_UNAVAILABLE" as const;
  if (result.ok && !isStale(result.asOf)) {
    try { const saved = await saveFreeFloat(result); return { ...result, cached: false, fetchedAt: saved?.fetchedAt ?? new Date() }; } catch { return { ...result, cached: false, fetchedAt: new Date() }; }
  }
  const secFloat = await fetchSecFreeFloat(ticker, market).catch(() => null);
  const sec = secFloat?.ok ? null : await fetchSecOutstandingShares(ticker, market).catch(() => null);
  const selected = secFloat?.ok ? secFloat : sec?.ok ? sec : { ...result, ok: false, error: result.ok ? "FMP free-float data is older than 30 days and SEC fallback was unavailable" : result.error };
  if (selected.ok) { try { await saveFreeFloat(selected); } catch { /* return live fallback */ } }
  return { ...selected, fallbackReason, cached: false, fetchedAt: null };
}
