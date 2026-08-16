import { fetchFmpFreeFloat, type FreeFloatResult } from "@/lib/fmp-free-float";
import { fetchSecOutstandingShares } from "@/lib/sec-outstanding-shares";
import { fetchSecFreeFloat } from "@/lib/sec-free-float";
import { deleteFreeFloat, loadLatestFreeFloat, saveFreeFloat, saveFreeFloatDiagnostic } from "@/lib/free-float-repository";

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
    if (cached && !isStale(cached.asOf ?? cached.fetchedAt?.toISOString())) {
      const correctedPercent = cached.freeFloatPercent != null && cached.freeFloatPercent > 0 && cached.freeFloatPercent <= 100
        ? cached.freeFloatPercent
        : (cached.floatShares != null && cached.outstandingShares ? cached.floatShares / cached.outstandingShares * 100 : null);
      const corrected = { ok: true as const, ticker, floatShares: cached.floatShares, outstandingShares: cached.outstandingShares, freeFloatPercent: correctedPercent, asOf: cached.asOf, source: cached.source as "FMP" | "SEC", dataType: cached.source === "SEC" && cached.outstandingShares != null ? "OUTSTANDING_SHARES" as const : "FREE_FLOAT" as const, status: 200, cached: true, fetchedAt: cached.fetchedAt };
      if (correctedPercent !== cached.freeFloatPercent) { try { await saveFreeFloat(corrected); } catch { /* corrected response remains usable */ } }
      return corrected;
    }
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
  if (!selected.ok) { try { await saveFreeFloatDiagnostic({ ticker, market, failureReason: selected.error ?? "FREE_FLOAT_UNAVAILABLE", fmp: result, sec: secFloat?.ok ? secFloat : sec }); } catch { /* diagnostics must not block the response */ } }
  if (selected.ok) {
    try {
      const saved = await saveFreeFloat(selected);
      return { ...selected, fallbackReason, cached: false, fetchedAt: saved?.fetchedAt ?? null };
    } catch { /* the live fallback remains usable */ }
  }
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
  if (!selected.ok) { try { await saveFreeFloatDiagnostic({ ticker, market, failureReason: selected.error ?? "FREE_FLOAT_UNAVAILABLE", fmp: result, sec: secFloat?.ok ? secFloat : sec }); } catch { /* diagnostics must not block the response */ } }
  if (selected.ok) {
    try {
      const saved = await saveFreeFloat(selected);
      return { ...selected, fallbackReason, cached: false, fetchedAt: saved?.fetchedAt ?? null };
    } catch { /* return live fallback */ }
  }
  return { ...selected, fallbackReason, cached: false, fetchedAt: null };
}
