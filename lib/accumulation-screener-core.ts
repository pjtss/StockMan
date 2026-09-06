/** Pure, market-independent OHLCV heuristics. Scores are not probabilities. */
export const ACCUMULATION_POLICY = {
  version: "2.0.0", minimumBars: 41, historyBars: 120,
  defaultMinRvol: 2, defaultMinScore: 0,
  rvol: "volume[t] / EMA20(volume)[t-1]",
  volumeExpansion: "EMA5(volume)[t] / EMA20(volume)[t-5]",
  atr: "EMA20(true range) / close; not Wilder ATR",
  elevatedVolumeRatio: 1.1, sustainedVolumeDays: 3,
  absorptionCloseLocation: 0.6, absorptionRatio: 0.55, minimumDownDays: 2,
  atrContractionRatio: 0.8, maximumPriceRange: 0.35,
  isolatedSpikeRvol: 3, isolatedSpikePenalty: 15,
  weights: { obv: 15, adl: 15, rvol: 10, emaAligned: 10, goldenCross: 10,
    aboveEma9: 5, volumeBalance: 5, persistence: 15, absorption: 10, volatility: 5 },
} as const;

export type AccumulationCandle = {
  date: string; updatedAt: string; tradingAt: string | null;
  open: number; high: number; low: number; close: number; volume: number;
};
export type AccumulationFeatures = {
  obvChange20: number; adlChange20: number; rvol: number;
  ema9: number; ema20: number; emaAligned: boolean; recentGoldenCross: boolean;
  goldenCrossDate: string | null; closeAboveEma9: boolean;
  volumeBalance: number; volumeExpansion5: number; elevatedVolumeDays5: number;
  downVolumeRatio: number; downDays5: number; absorptionRatio5: number | null;
  priceRange20: number; atrPercent: number; atrContraction: number | null;
  turnoverEma5: number;
};
export type ScoreReason = { code: string; label: string; points: number; possiblePoints: number; passed: boolean };

export function calculateEma(values: number[], period: number): number[] {
  if (!Number.isInteger(period) || period < 1 || values.some(v => !Number.isFinite(v))) throw new Error("INVALID_EMA_INPUT");
  const alpha = 2 / (period + 1), out: number[] = [];
  for (const value of values) out.push(out.length ? value * alpha + out[out.length - 1] * (1 - alpha) : value);
  return out;
}

export function validTradingDate(date: string): boolean {
  if (!/^\d{8}$/.test(date)) return false;
  const parsed = new Date(date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6) + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10).replaceAll("-", "") === date
    && ![0, 6].includes(parsed.getUTCDay());
}

export function validOhlcv(c: Pick<AccumulationCandle, "open" | "high" | "low" | "close" | "volume">): boolean {
  return [c.open, c.high, c.low, c.close, c.volume].every(v => typeof v === "number" && Number.isFinite(v))
    && Math.min(c.open, c.low, c.close) > 0 && c.volume >= 0
    && c.high >= Math.max(c.open, c.low, c.close) && c.low <= Math.min(c.open, c.close);
}

export function findRecentGoldenCross(fast: number[], slow: number[], window = 5): number | null {
  const end = fast.length - 1;
  if (fast.length !== slow.length || end < 1 || fast[end] <= slow[end]) return null;
  for (let i = end; i >= Math.max(1, end - window + 1); i--) {
    if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) return i;
  }
  return null;
}

export function calculateAccumulationFeatures(candles: AccumulationCandle[]): AccumulationFeatures {
  if (candles.length < ACCUMULATION_POLICY.minimumBars || candles.some((c, i) => !validOhlcv(c)
    || !validTradingDate(c.date) || (i > 0 && candles[i - 1].date >= c.date))) throw new Error("INVALID_CANDLES");
  const closes = candles.map(c => c.close), volumes = candles.map(c => c.volume);
  const ema9 = calculateEma(closes, 9), ema20 = calculateEma(closes, 20);
  const volume20 = calculateEma(volumes, 20), volume5 = calculateEma(volumes, 5);
  const obv: number[] = [], adl: number[] = [], ranges: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i], previous = candles[Math.max(0, i - 1)];
    obv.push((obv[i - 1] ?? 0) + (i ? Math.sign(c.close - previous.close) * c.volume : 0));
    adl.push((adl[i - 1] ?? 0) + (c.high === c.low ? 0 : (2 * c.close - c.low - c.high) / (c.high - c.low) * c.volume));
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - previous.close), Math.abs(c.low - previous.close)));
  }
  const last = candles.length - 1, current = candles[last];
  if (volume20[last - 1] <= 0) throw new Error("ZERO_VOLUME_BASELINE");
  const atr20 = calculateEma(ranges, 20), atr5 = calculateEma(ranges, 5);
  let upVolume = 0, downVolume = 0, totalVolume = 0, absorbedVolume = 0, downDays = 0, elevatedDays = 0;
  for (let i = last - 4; i <= last; i++) {
    const c = candles[i];
    totalVolume += c.volume;
    // Up/down days refer to previous close, not candle colour (open vs close).
    if (c.close > candles[i - 1].close) upVolume += c.volume;
    if (c.close < candles[i - 1].close && c.volume > 0) {
      downVolume += c.volume; downDays++;
      if (c.high > c.low && (c.close - c.low) / (c.high - c.low) >= ACCUMULATION_POLICY.absorptionCloseLocation) absorbedVolume += c.volume;
    }
    if (volume20[i - 1] > 0 && c.volume / volume20[i - 1] >= ACCUMULATION_POLICY.elevatedVolumeRatio) elevatedDays++;
  }
  const cross = findRecentGoldenCross(ema9, ema20), recent20 = candles.slice(-20);
  const features: AccumulationFeatures = {
    obvChange20: obv[last] - obv[last - 20], adlChange20: adl[last] - adl[last - 20],
    rvol: current.volume / volume20[last - 1], ema9: ema9[last], ema20: ema20[last],
    emaAligned: ema9[last] > ema20[last], recentGoldenCross: cross !== null,
    goldenCrossDate: cross === null ? null : candles[cross].date, closeAboveEma9: current.close > ema9[last],
    volumeBalance: upVolume + downVolume > 0 ? upVolume / (upVolume + downVolume) : 0,
    volumeExpansion5: volume20[last - 5] > 0 ? volume5[last] / volume20[last - 5] : 0,
    elevatedVolumeDays5: elevatedDays, downVolumeRatio: totalVolume > 0 ? downVolume / totalVolume : 0,
    downDays5: downDays, absorptionRatio5: downVolume > 0 ? absorbedVolume / downVolume : null,
    priceRange20: (Math.max(...recent20.map(c => c.high)) - Math.min(...recent20.map(c => c.low))) / current.close,
    atrPercent: atr20[last] / current.close,
    atrContraction: atr20[last - 5] > 0 ? atr5[last] / atr20[last - 5] : null,
    turnoverEma5: calculateEma(candles.map(c => c.close * c.volume), 5)[last],
  };
  if (Object.values(features).some(v => typeof v === "number" && !Number.isFinite(v))) throw new Error("NON_FINITE_FEATURE");
  return features;
}

export function explainAccumulationScore(f: AccumulationFeatures, minRvol: number): ScoreReason[] {
  const p = ACCUMULATION_POLICY;
  const checks: [keyof typeof p.weights, string, boolean][] = [
    ["obv", "OBV 20봉 증가", f.obvChange20 > 0], ["adl", "ADL 20봉 증가", f.adlChange20 > 0],
    ["rvol", "전일 거래량 EMA20 대비 RVOL 통과", f.rvol >= minRvol],
    ["emaAligned", "EMA9 > EMA20", f.emaAligned], ["goldenCross", "최근 5봉 상향 교차 및 정배열 유지", f.recentGoldenCross],
    ["aboveEma9", "종가 > EMA9", f.closeAboveEma9], ["volumeBalance", "상승일 거래량 비중 ≥ 55%", f.volumeBalance >= 0.55],
    ["persistence", "최근 5봉 중 3봉 이상 거래량 확장", f.elevatedVolumeDays5 >= p.sustainedVolumeDays && f.volumeExpansion5 >= p.elevatedVolumeRatio],
    ["absorption", "하락일 2봉 이상 및 상단 종가 회복 거래량 ≥ 55%", f.downDays5 >= p.minimumDownDays && f.absorptionRatio5 !== null && f.absorptionRatio5 >= p.absorptionRatio],
    ["volatility", "EMA ATR 수축 및 제한된 가격범위", f.atrContraction !== null && f.atrContraction <= p.atrContractionRatio && f.priceRange20 <= p.maximumPriceRange],
  ];
  const reasons: ScoreReason[] = checks.map(([code, label, passed]) => ({ code, label, passed, points: passed ? p.weights[code] : 0, possiblePoints: p.weights[code] }));
  const isolated = f.rvol >= p.isolatedSpikeRvol && f.elevatedVolumeDays5 < 2;
  reasons.push({ code: "isolatedSpike", label: "단발 거래량 급증 감점", passed: isolated, points: isolated ? -p.isolatedSpikePenalty : 0, possiblePoints: -p.isolatedSpikePenalty });
  return reasons;
}

export function scoreAccumulation(features: AccumulationFeatures, minRvol: number): number {
  return explainAccumulationScore(features, minRvol).reduce((sum, reason) => sum + reason.points, 0);
}
