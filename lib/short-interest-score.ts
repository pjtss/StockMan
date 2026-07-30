import type { ShortInterestMetric } from "@/lib/short-interest-types";

export type ShortInterestScore = { score: number; level: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"; reasons: string[] };

/** Scores only supplied market-wide metrics; missing data never becomes a bullish/bearish guess. */
export function scoreShortInterest(metric: ShortInterestMetric): ShortInterestScore {
  if (metric.status !== "OK" && metric.status !== "ZERO_SHORT_VOLUME") return { score: 0, level: "UNKNOWN", reasons: [metric.reason || `공매도 상태: ${metric.status}`] };
  let score = 0;
  const reasons: string[] = [];
  if (metric.shortVolumeRatio != null) {
    if (metric.shortVolumeRatio >= 50) { score += 2; reasons.push("일별 공매도 거래량 비율 50% 이상"); }
    else if (metric.shortVolumeRatio >= 30) { score += 1; reasons.push("일별 공매도 거래량 비율 30% 이상"); }
  }
  if (metric.daysToCover != null) {
    if (metric.daysToCover >= 5) { score += 2; reasons.push("Days to Cover 5일 이상"); }
    else if (metric.daysToCover >= 2) { score += 1; reasons.push("Days to Cover 2일 이상"); }
  }
  return { score, level: score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW", reasons };
}
