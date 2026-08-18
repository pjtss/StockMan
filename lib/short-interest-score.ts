import type { ShortInterestMetric } from "@/lib/short-interest-types";

export type ShortInterestScore = { score: number; level: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"; reasons: string[] };

/** Scores only supplied market-wide metrics; missing data never becomes a bullish/bearish guess. */
export function scoreShortInterest(metric: ShortInterestMetric): ShortInterestScore {
  if (metric.status !== "OK" && metric.status !== "ZERO_SHORT_VOLUME") return { score: 0, level: "UNKNOWN", reasons: [metric.reason || `공매도 상태: ${metric.status}`] };
  let score = 0;
  const reasons: string[] = [];
  if (metric.shortVolumeRatio != null) {
    // Contract: ratios are stored as fractions (0.25 = 25%).
    if (metric.shortVolumeRatio >= 0.5) { score += 2; reasons.push("일별 공매도 거래량 비율 50% 이상"); }
    else if (metric.shortVolumeRatio >= 0.3) { score += 1; reasons.push("일별 공매도 거래량 비율 30% 이상"); }
  }
  if (metric.daysToCover != null) {
    if (metric.daysToCover >= 5) { score += 2; reasons.push("Days to Cover 5일 이상"); }
    else if (metric.daysToCover >= 2) { score += 1; reasons.push("Days to Cover 2일 이상"); }
  }
  if (metric.shortInterestChangePercent != null) {
    if (metric.shortInterestChangePercent >= 50) { score += 2; reasons.push("공매도 잔고 50% 이상 증가"); }
    else if (metric.shortInterestChangePercent >= 20) { score += 1; reasons.push("공매도 잔고 20% 이상 증가"); }
  }
  if (metric.thresholdListed === true) { score += 2; reasons.push("FINRA Threshold List 포함"); }
  return { score, level: score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW", reasons };
}
