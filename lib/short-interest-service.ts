import { normalizeFinraShortVolume, unavailableShortInterest } from "@/lib/short-interest-sources";
import type { ShortInterestMetric } from "@/lib/short-interest-types";
import { loadTodayShortInterest, saveShortInterest } from "@/lib/short-interest-repository";

/** Free-provider boundary. Configure FINRA_SHORT_VOLUME_URL with {ticker} placeholder. */
export async function fetchFreeShortInterest(rawTicker: string): Promise<ShortInterestMetric> {
  const ticker = rawTicker.trim().toUpperCase();
  try {
    const cached = await loadTodayShortInterest(ticker, "FINRA");
    if (cached) return { ticker, shortVolume: cached.shortVolume, totalVolume: cached.totalVolume, shortVolumeRatio: cached.shortVolumeRatio, shortInterest: cached.shortInterest, daysToCover: cached.daysToCover, asOf: cached.asOf, source: "FINRA", status: cached.status as ShortInterestMetric["status"] };
  } catch { /* Flyway V9 may not be applied yet; live lookup remains available. */ }
  const template = process.env.FINRA_SHORT_VOLUME_URL?.trim();
  if (!template) return unavailableShortInterest(ticker, "FINRA");
  try {
    const url = template.replace("{ticker}", encodeURIComponent(ticker));
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return unavailableShortInterest(ticker, "FINRA");
    const raw = await response.json() as any;
    const rows = Array.isArray(raw) ? raw : raw?.data || raw?.results || [];
    const metric = normalizeFinraShortVolume(ticker, (rows[0] || raw) as Record<string, unknown>);
    try { await saveShortInterest(metric); } catch { /* return live metric if cache is unavailable */ }
    return metric;
  } catch { return unavailableShortInterest(ticker, "FINRA"); }
}
