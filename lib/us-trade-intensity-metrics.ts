import type { KisUsTrade } from "@/lib/kis-us-trade-trend";

export type TradeIntensityMetrics = {
  sampleCount: number;
  recentCount: number;
  previousCount: number;
  latestIntensity: number | null;
  recentAverageIntensity: number | null;
  previousAverageIntensity: number | null;
  intensityChange: number | null;
  intensityAbove100Rate: number | null;
  latestPrice: number | null;
  priceChange: number | null;
  recentVolume: number;
  previousVolume: number;
  volumeChangeRate: number | null;
  spreadRate: number | null;
  marketTypeCounts: Record<string, number>;
  dataQuality: "SUFFICIENT" | "INSUFFICIENT";
};

export type TradeIntensityScore = {
  score: number;
  level: "STRONG" | "WATCH" | "REJECT";
  reasons: string[];
  failedConditions: string[];
};

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const average = (values: Array<number | null>) => {
  const usable = values.filter(finite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};

export function deduplicateTradeIntensityTrades(trades: KisUsTrade[]): KisUsTrade[] {
  const seen = new Set<string>();
  return trades.filter((trade) => {
    const key = [trade.time, trade.price ?? "", trade.volume ?? "", trade.totalVolume ?? ""].join("|");
    if (!trade.time || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The API returns newest-first data. The first half is treated as recent and
 * the second half as the previous comparable sample. This deliberately uses
 * samples, not wall-clock minutes, because KIS returns irregular executions.
 */
export function calculateTradeIntensityMetrics(trades: KisUsTrade[]): TradeIntensityMetrics {
  const ordered = deduplicateTradeIntensityTrades(trades.filter((trade) => trade.time));
  const split = Math.max(1, Math.floor(ordered.length / 2));
  const recent = ordered.slice(0, split);
  const previous = ordered.slice(split);
  const recentAverageIntensity = average(recent.map((trade) => trade.intensity));
  const previousAverageIntensity = average(previous.map((trade) => trade.intensity));
  const latest = ordered[0];
  const recentVolume = recent.reduce((sum, trade) => sum + (finite(trade.volume) ? trade.volume : 0), 0);
  const previousVolume = previous.reduce((sum, trade) => sum + (finite(trade.volume) ? trade.volume : 0), 0);
  const latestPrice = finite(latest?.price) ? latest.price : null;
  const oldestPrice = finite(ordered.at(-1)?.price) ? ordered.at(-1)!.price : null;
  const spreadRate = finite(latest?.bid) && finite(latest?.ask) && latest.bid > 0 ? ((latest.ask - latest.bid) / latest.bid) * 100 : null;
  const marketTypeCounts = ordered.reduce<Record<string, number>>((counts, trade) => {
    counts[trade.marketType || "UNKNOWN"] = (counts[trade.marketType || "UNKNOWN"] || 0) + 1;
    return counts;
  }, {});

  return {
    sampleCount: ordered.length,
    recentCount: recent.length,
    previousCount: previous.length,
    latestIntensity: finite(latest?.intensity) ? latest.intensity : null,
    recentAverageIntensity,
    previousAverageIntensity,
    intensityChange: recentAverageIntensity != null && previousAverageIntensity != null ? recentAverageIntensity - previousAverageIntensity : null,
    intensityAbove100Rate: recent.length ? recent.filter((trade) => finite(trade.intensity) && trade.intensity >= 100).length / recent.length : null,
    latestPrice,
    priceChange: latestPrice != null && oldestPrice != null && oldestPrice !== 0 ? ((latestPrice - oldestPrice) / oldestPrice) * 100 : null,
    recentVolume,
    previousVolume,
    volumeChangeRate: previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : null,
    spreadRate,
    marketTypeCounts,
    dataQuality: ordered.length >= 4 && previous.length >= 2 ? "SUFFICIENT" : "INSUFFICIENT",
  };
}

export type TradeIntensityScoringOptions = {
  minSamples?: number;
  strongScore?: number;
  watchScore?: number;
  minimumAverageIntensity?: number;
};

export function scoreTradeIntensity(metrics: TradeIntensityMetrics, options: TradeIntensityScoringOptions = {}): TradeIntensityScore {
  const minSamples = options.minSamples ?? 4;
  const strongScore = options.strongScore ?? 80;
  const watchScore = options.watchScore ?? 60;
  const minimumAverageIntensity = options.minimumAverageIntensity ?? 100;
  let score = 0;
  const reasons: string[] = [];
  const failedConditions: string[] = [];
  if (metrics.sampleCount < minSamples || metrics.dataQuality === "INSUFFICIENT") failedConditions.push(`분석 표본 부족 (${metrics.sampleCount}/${minSamples})`);
  if (metrics.recentAverageIntensity != null && metrics.recentAverageIntensity >= minimumAverageIntensity) { score += 20; reasons.push(`최근 평균 체결강도 ${minimumAverageIntensity} 이상`); } else failedConditions.push("최근 평균 체결강도 기준 미달 또는 데이터 없음");
  if (metrics.recentAverageIntensity != null && metrics.recentAverageIntensity >= 120) { score += 15; reasons.push("최근 평균 체결강도 120 이상"); }
  if (metrics.intensityChange != null && metrics.intensityChange > 0) { score += 20; reasons.push("직전 구간 대비 체결강도 상승"); } else failedConditions.push("직전 구간 대비 체결강도 상승 아님");
  if (metrics.intensityAbove100Rate != null && metrics.intensityAbove100Rate >= 0.6) { score += 15; reasons.push("최근 체결강도 100 이상 비율 60% 이상"); } else failedConditions.push("체결강도 100 이상 유지 비율 부족");
  if (metrics.priceChange != null && metrics.priceChange >= 0) { score += 10; reasons.push("분석 구간 가격 상승 또는 보합"); } else failedConditions.push("분석 구간 가격 하락");
  if (metrics.volumeChangeRate != null && metrics.volumeChangeRate > 0) { score += 10; reasons.push("최근 체결량 증가"); } else failedConditions.push("최근 체결량 증가 아님");
  if (metrics.spreadRate == null || metrics.spreadRate <= 2) { score += 5; reasons.push("호가 스프레드 2% 이하 또는 미제공"); } else failedConditions.push("호가 스프레드 2% 초과");
  const level = metrics.sampleCount < minSamples || metrics.dataQuality === "INSUFFICIENT" ? "REJECT" : score >= strongScore ? "STRONG" : score >= watchScore ? "WATCH" : "REJECT";
  return { score, level, reasons, failedConditions };
}
