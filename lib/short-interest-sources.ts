import type { ShortInterestMetric } from "@/lib/short-interest-types";

const num = (value: unknown) => { const n = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; };

/** Normalizes a FINRA Reg SHO row. The provider response is deliberately kept outside the domain model. */
export function normalizeFinraShortVolume(ticker: string, row: Record<string, unknown> | null): ShortInterestMetric {
  const shortVolume = num(row?.shortParQuantity ?? row?.shortVolume ?? row?.short_volume);
  const totalVolume = num(row?.totalParQuantity ?? row?.totalVolume ?? row?.total_volume);
  return { ticker: ticker.toUpperCase(), shortVolume, totalVolume, shortVolumeRatio: shortVolume != null && totalVolume ? shortVolume / totalVolume * 100 : null, shortInterest: null, daysToCover: null, asOf: String(row?.tradeReportDate ?? row?.tradeDate ?? row?.trade_date ?? "").trim() || null, source: "FINRA", status: shortVolume != null ? "OK" : "UNAVAILABLE" };
}

export function unavailableShortInterest(ticker: string, source: ShortInterestMetric["source"], status: "UNAVAILABLE" | "STALE" = "UNAVAILABLE"): ShortInterestMetric {
  return { ticker: ticker.trim().toUpperCase(), shortVolume: null, totalVolume: null, shortVolumeRatio: null, shortInterest: null, daysToCover: null, asOf: null, source, status };
}
