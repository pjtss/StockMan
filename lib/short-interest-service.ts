import { normalizeFinraShortVolume, unavailableShortInterest } from "@/lib/short-interest-sources";
import type { ShortInterestMetric } from "@/lib/short-interest-types";
import { loadTodayShortInterest, saveShortInterest } from "@/lib/short-interest-repository";

const FINRA_REG_SHO_URL = "https://api.finra.org/data/group/otcMarket/name/regShoDaily";

/** Free-provider boundary. FINRA_SHORT_VOLUME_URL is optional and only overrides the official endpoint. */
export async function fetchFreeShortInterest(rawTicker: string): Promise<ShortInterestMetric> {
  const ticker = rawTicker.trim().toUpperCase();
  try {
    const cached = await loadTodayShortInterest(ticker, "FINRA");
    if (cached) return { ticker, shortVolume: cached.shortVolume, totalVolume: cached.totalVolume, shortVolumeRatio: cached.shortVolumeRatio, shortInterest: cached.shortInterest, daysToCover: cached.daysToCover, asOf: cached.asOf, source: "FINRA", status: cached.status as ShortInterestMetric["status"] };
  } catch { /* Flyway V9 may not be applied yet; live lookup remains available. */ }
  const url = process.env.FINRA_SHORT_VOLUME_URL?.trim() || FINRA_REG_SHO_URL;
  try {
    const response = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ limit: 20, fields: ["tradeReportDate", "securitiesInformationProcessorSymbolIdentifier", "shortParQuantity", "shortExemptParQuantity", "totalParQuantity"], compareFilters: [{ compareType: "equal", fieldName: "securitiesInformationProcessorSymbolIdentifier", fieldValue: ticker }] }), cache: "no-store" });
    if (!response.ok) return unavailableShortInterest(ticker, "FINRA", "API_ERROR", `FINRA HTTP ${response.status}`);
    const raw = await response.json() as any;
    const rows = Array.isArray(raw) ? raw : raw?.data || raw?.results || [];
    const row = rows.find((item: any) => String(item?.securitiesInformationProcessorSymbolIdentifier || "").toUpperCase() === ticker) || rows[0] || null;
    if (!row) return unavailableShortInterest(ticker, "FINRA", "NO_RECORD", "FINRA 응답에 해당 티커 행이 없음");
    const metric = normalizeFinraShortVolume(ticker, row as Record<string, unknown> | null);
    try { await saveShortInterest(metric); } catch { /* return live metric if cache is unavailable */ }
    return metric;
  } catch { return unavailableShortInterest(ticker, "FINRA"); }
}
