import { normalizeFinraShortVolume, unavailableShortInterest } from "@/lib/short-interest-sources";
import type { ShortInterestMetric } from "@/lib/short-interest-types";

/** Free-provider boundary. Configure FINRA_SHORT_VOLUME_URL with {ticker} placeholder. */
export async function fetchFreeShortInterest(rawTicker: string): Promise<ShortInterestMetric> {
  const ticker = rawTicker.trim().toUpperCase();
  const template = process.env.FINRA_SHORT_VOLUME_URL?.trim();
  if (!template) return unavailableShortInterest(ticker, "FINRA");
  try {
    const url = template.replace("{ticker}", encodeURIComponent(ticker));
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return unavailableShortInterest(ticker, "FINRA");
    const raw = await response.json() as any;
    const rows = Array.isArray(raw) ? raw : raw?.data || raw?.results || [];
    return normalizeFinraShortVolume(ticker, (rows[0] || raw) as Record<string, unknown>);
  } catch { return unavailableShortInterest(ticker, "FINRA"); }
}
