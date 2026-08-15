import type { ShortInterestMetric } from "@/lib/short-interest-types";

const num = (value: unknown) => { if (value == null || String(value).trim() === "") return null; const n = Number(String(value).replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; };

/** Normalizes a FINRA Reg SHO row. The provider response is deliberately kept outside the domain model. */
export function normalizeFinraShortVolume(ticker: string, row: Record<string, unknown> | null): ShortInterestMetric {
  const shortVolume = num(row?.shortParQuantity ?? row?.shortVolume ?? row?.short_volume);
  const totalVolume = num(row?.totalParQuantity ?? row?.totalVolume ?? row?.total_volume);
  const asOf = String(row?.tradeReportDate ?? row?.tradeDate ?? row?.trade_date ?? "").trim() || null;
  const status = shortVolume == null || totalVolume == null ? "NULL_FIELD" : shortVolume === 0 ? "ZERO_SHORT_VOLUME" : "OK";
  return { ticker: ticker.toUpperCase(), shortVolume, totalVolume, shortVolumeRatio: shortVolume != null && totalVolume ? shortVolume / totalVolume : null, shortInterest: null, daysToCover: null, asOf, shortVolumeAsOf: asOf, shortInterestAsOf: null, source: "FINRA", status, reason: status === "NULL_FIELD" ? "FINRA 응답 필수 수량 필드 누락" : undefined };
}

export function unavailableShortInterest(ticker: string, source: ShortInterestMetric["source"], status: ShortInterestMetric["status"] = "API_ERROR", reason = "공급자 응답 없음"): ShortInterestMetric {
  return { ticker: ticker.trim().toUpperCase(), shortVolume: null, totalVolume: null, shortVolumeRatio: null, shortInterest: null, daysToCover: null, asOf: null, source, status, reason };
}
