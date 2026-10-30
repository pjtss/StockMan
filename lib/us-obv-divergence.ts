export const US_OBV_DIVERGENCE_VERSION = "4.0.0";

export type ObvCandle = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
};

export type ObvInstrument = {
  market: string; code: string; name: string;
  marketCapUsd?: number | null; marketCapObservedAtUtc?: string | null;
};

export type ObvCandidate = {
  ticker: string;
  market: string;
  name: string;
  exchange: string;
  marketCapUsd: number | null;
  marketCapObservedAtUtc: string | null;
  candleDate: string;
  close: number;
  signalType: "TREND" | "PIVOT" | "BOTH";
  signalQuality: "HIGH" | "STANDARD" | "REVIEW";
  priceBasis: "UNVERIFIED_CORPORATE_ACTION_ADJUSTMENT";
  price20dPct: number;
  obv20dAvgVolumeMultiple: number;
  priceRegressionSlopePerDay: number;
  obvSlopePerDay: number;
  obvPositiveDayConcentration: number;
  obvPositiveDays20d: number;
  avgDollarVolume20d: number;
  avgDollarVolume5d: number;
  recentVolume5dTo20d: number;
  obvLast5dAvgVolumeMultiple: number;
  pivot1Date: string | null;
  pivot1Low: number | null;
  pivot2Date: string | null;
  pivot2Low: number | null;
  pivotPricePct: number | null;
  pivotObvNormalized: number | null;
  alignedObvTroughGainNormalized: number | null;
  pivotConfirmedDate: string | null;
  pivotAgeSessions: number | null;
  dataIssues: string[];
  bars: number;
  algoVersion: string;
  candleMetadata?: Array<{ candleDate: string; dataUpdatedAtUtc: string | null }>;
};

export type ObvEvaluation = { candidate: ObvCandidate | null; reason: string | null };

const CONFIG = {
  lookback: 20,
  minBars: 80,
  minDollarVolume20d: 100_000,
  minDollarVolume5d: 50_000,
  pivotRadius: 3,
  pivotProminencePct: 3,
  pivotMinSeparation: 7,
  pivotMaxSeparation: 45,
  pivotMaxAge: 12,
  minPivotPriceDropPct: 1,
  minPivotObvNormalized: 0.5,
  minTrendPriceDropPct: 2,
  minTrendObvNormalized: 1,
  maxObvConcentration: 0.6,
  minRecentVolumeRatio: 0.25,
  maxAbsoluteSessionChange: 0.65,
  maxDataAgeDays: 5,
  maxSpanDays20: 45,
  minPositiveObvDays: 3,
  obv5dWarningRatio: -1,
} as const;

function parseIsoDate(value: string): Date | null {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
    : value.slice(0, 10).replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? null : date;
}

export function normalizeCandleDate(value: string): string | null {
  return parseIsoDate(value)?.toISOString().slice(0, 10) ?? null;
}

function daysBetween(first: string, last: string): number {
  return Math.round((parseIsoDate(last)!.getTime() - parseIsoDate(first)!.getTime()) / 86_400_000);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function regressionSlope(values: number[]): number {
  const center = (values.length - 1) / 2;
  const denominator = values.reduce((sum, _, index) => sum + (index - center) ** 2, 0);
  const average = mean(values);
  return denominator ? values.reduce((sum, value, index) => sum + (index - center) * (value - average), 0) / denominator : 0;
}

function obvSeries(bars: ObvCandle[]): number[] {
  const result = [0];
  for (let index = 1; index < bars.length; index += 1) {
    const direction = Math.sign(bars[index].close - bars[index - 1].close);
    result.push(result.at(-1)! + direction * bars[index].volume);
  }
  return result;
}

function evaluateCandleValidity(bars: ObvCandle[]): string | null {
  for (const candle of bars) {
    if (!candle.date || !Number.isFinite(candle.close) || !Number.isFinite(candle.volume) || candle.close <= 0 || candle.volume < 0) return "INVALID_OHLCV";
    if (candle.low !== null && (!Number.isFinite(candle.low) || candle.low <= 0 || candle.low > candle.close * 1.00001)) return "INVALID_LOW";
    if (candle.high !== null && (!Number.isFinite(candle.high) || candle.high < candle.close * 0.99999 || (candle.low !== null && candle.high < candle.low))) return "INVALID_HIGH";
    if (candle.open !== null && (!Number.isFinite(candle.open) || candle.open <= 0 || (candle.low !== null && candle.open < candle.low * 0.99999) || (candle.high !== null && candle.open > candle.high * 1.00001))) return "INVALID_OPEN";
  }
  return null;
}

function findPricePivots(bars: ObvCandle[]): number[] {
  const radius = CONFIG.pivotRadius;
  if (bars.some((bar) => bar.low === null)) return [];
  const pivots: number[] = [];
  for (let index = radius; index < bars.length - radius; index += 1) {
    const low = bars[index].low!;
    const neighborhood = bars.slice(index - radius, index + radius + 1).filter((_, offset) => offset !== radius).map((bar) => bar.low!);
    const leftPeak = Math.max(...bars.slice(index - radius, index).map((bar) => bar.low!));
    const rightPeak = Math.max(...bars.slice(index + 1, index + radius + 1).map((bar) => bar.low!));
    const prominence = 100 * (Math.min(leftPeak, rightPeak) / low - 1);
    const tiedToRight = bars.slice(index + 1, index + radius + 1).some((bar) => low === bar.low);
    if (neighborhood.every((value) => low <= value) && prominence >= CONFIG.pivotProminencePct && !tiedToRight) pivots.push(index);
  }
  return pivots;
}

type PivotSignal = {
  firstDate: string; firstLow: number; secondDate: string; secondLow: number;
  pricePct: number; obvNormalized: number; troughGainNormalized: number;
  confirmedDate: string; ageSessions: number;
};

function latestPivotPair(bars: ObvCandle[], obv: number[], averageVolume: number): PivotSignal | null {
  const pivots = findPricePivots(bars);
  if (pivots.length < 2 || averageVolume <= 0) return null;
  const [first, second] = pivots.slice(-2);
  const ageSessions = bars.length - 1 - second;
  if (ageSessions > CONFIG.pivotMaxAge || second - first < CONFIG.pivotMinSeparation || second - first > CONFIG.pivotMaxSeparation) return null;
  const pricePct = 100 * (bars[second].low! / bars[first].low! - 1);
  const firstTrough = Math.min(...obv.slice(Math.max(0, first - 2), Math.min(bars.length, first + 3)));
  const secondTrough = Math.min(...obv.slice(Math.max(0, second - 2), Math.min(bars.length, second + 3)));
  const obvNormalized = (obv[second] - obv[first]) / averageVolume;
  const troughGainNormalized = (secondTrough - firstTrough) / averageVolume;
  if (pricePct > -CONFIG.minPivotPriceDropPct || obvNormalized < CONFIG.minPivotObvNormalized || troughGainNormalized < CONFIG.minPivotObvNormalized) return null;
  return {
    firstDate: bars[first].date, firstLow: bars[first].low!, secondDate: bars[second].date, secondLow: bars[second].low!,
    pricePct, obvNormalized, troughGainNormalized, confirmedDate: bars[second + CONFIG.pivotRadius].date, ageSessions,
  };
}

export function evaluateUsObvDivergence(
  sourceBars: ObvCandle[], instrument: ObvInstrument, asOfDate: string,
): ObvEvaluation {
  const asOf = normalizeCandleDate(asOfDate);
  if (!asOf) return { candidate: null, reason: "INVALID_AS_OF_DATE" };
  const bars = sourceBars
    .map((bar) => ({ ...bar, date: normalizeCandleDate(bar.date) ?? "" }))
    .filter((bar) => bar.date && bar.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-160);
  const validity = evaluateCandleValidity(bars);
  if (validity) return { candidate: null, reason: validity };
  const count = bars.length;
  if (count < Math.max(CONFIG.minBars, CONFIG.lookback + 2)) return { candidate: null, reason: "INSUFFICIENT_HISTORY" };
  if (daysBetween(bars.at(-1)!.date, asOf) > CONFIG.maxDataAgeDays) return { candidate: null, reason: "STALE_DAILY_DATA" };
  if (daysBetween(bars[count - CONFIG.lookback].date, bars.at(-1)!.date) > CONFIG.maxSpanDays20) return { candidate: null, reason: "SPARSE_TRADING_HISTORY" };

  const recent20 = bars.slice(-CONFIG.lookback);
  if (recent20.some((bar) => bar.volume <= 0)) return { candidate: null, reason: "ZERO_VOLUME_OR_SUSPENDED" };
  if (bars.slice(1).some((bar, index) => Math.abs(bar.close / bars[index].close - 1) > CONFIG.maxAbsoluteSessionChange)) return { candidate: null, reason: "POSSIBLE_SPLIT_OR_UNADJUSTED_CORPORATE_ACTION" };
  const averageDollarVolume20d = mean(recent20.map((bar) => bar.close * bar.volume));
  const averageDollarVolume5d = mean(bars.slice(-5).map((bar) => bar.close * bar.volume));
  if (averageDollarVolume20d < CONFIG.minDollarVolume20d || averageDollarVolume5d < CONFIG.minDollarVolume5d) return { candidate: null, reason: "LOW_DOLLAR_LIQUIDITY" };
  const averageVolume20d = mean(recent20.map((bar) => bar.volume));
  const averageVolume5d = mean(bars.slice(-5).map((bar) => bar.volume));
  if (averageVolume20d <= 0) return { candidate: null, reason: "ZERO_AVERAGE_VOLUME" };
  const recentVolumeRatio = averageVolume5d / averageVolume20d;
  if (recentVolumeRatio < CONFIG.minRecentVolumeRatio) return { candidate: null, reason: "VOLUME_ACTIVITY_COLLAPSED" };

  const obv = obvSeries(bars);
  const baselineIndex = count - CONFIG.lookback - 1;
  const price20dPct = 100 * (bars.at(-1)!.close / bars[baselineIndex].close - 1);
  const obv20dAvgVolumeMultiple = (obv.at(-1)! - obv[baselineIndex]) / averageVolume20d;
  if (price20dPct >= 0 || obv20dAvgVolumeMultiple <= 0) return { candidate: null, reason: "NO_20D_PRICE_DOWN_OBV_UP" };
  const priceRegressionSlopePerDay = regressionSlope(bars.slice(-CONFIG.lookback - 1).map((bar) => bar.close));
  const obvSlopePerDay = regressionSlope(obv.slice(-CONFIG.lookback - 1));
  const increments = obv.slice(count - CONFIG.lookback).map((value, index, values) => value - (index === 0 ? obv[count - CONFIG.lookback - 1] : values[index - 1]));
  const positiveObvIncrements = increments.filter((value) => value > 0);
  const obvPositiveDayConcentration = positiveObvIncrements.length
    ? Math.max(...positiveObvIncrements) / positiveObvIncrements.reduce((sum, value) => sum + value, 0)
    : 1;
  const obvPositiveDays20d = positiveObvIncrements.length;
  const trend = price20dPct <= -CONFIG.minTrendPriceDropPct
    && obv20dAvgVolumeMultiple >= CONFIG.minTrendObvNormalized
    && priceRegressionSlopePerDay < 0 && obvSlopePerDay > 0
    && obvPositiveDayConcentration <= CONFIG.maxObvConcentration
    && obvPositiveDays20d >= CONFIG.minPositiveObvDays;
  const pivot = latestPivotPair(bars, obv, averageVolume20d);
  if (!trend && !pivot) return { candidate: null, reason: "NO_CONFIRMED_DIVERGENCE" };
  const signalType = trend && pivot ? "BOTH" : pivot ? "PIVOT" : "TREND";
  const dataIssues: string[] = [];
  if (obvPositiveDayConcentration > CONFIG.maxObvConcentration) dataIssues.push("ONE_DAY_OBV_CONCENTRATION");
  if (obvPositiveDays20d < CONFIG.minPositiveObvDays) dataIssues.push("FEW_OBV_ADVANCE_DAYS");
  if (recentVolumeRatio < 0.5) dataIssues.push("RECENT_VOLUME_WEAK");
  const obvLast5dAvgVolumeMultiple = (obv.at(-1)! - obv[count - 6]) / averageVolume20d;
  if (obvLast5dAvgVolumeMultiple < CONFIG.obv5dWarningRatio) dataIssues.push("RECENT_OBV_REVERSAL");
  if (bars.some((bar) => bar.low === null)) dataIssues.push("PIVOT_UNAVAILABLE_MISSING_LOW");
  const candidate: ObvCandidate = {
    ticker: instrument.code, market: instrument.market, name: instrument.name, exchange: instrument.market,
    marketCapUsd: instrument.marketCapUsd ?? null,
    marketCapObservedAtUtc: instrument.marketCapObservedAtUtc ?? null,
    candleDate: bars.at(-1)!.date, close: bars.at(-1)!.close, signalType,
    signalQuality: dataIssues.length ? "REVIEW" : signalType === "BOTH" ? "HIGH" : "STANDARD",
    priceBasis: "UNVERIFIED_CORPORATE_ACTION_ADJUSTMENT", price20dPct, obv20dAvgVolumeMultiple,
    priceRegressionSlopePerDay, obvSlopePerDay, obvPositiveDayConcentration, obvPositiveDays20d,
    avgDollarVolume20d: averageDollarVolume20d, avgDollarVolume5d: averageDollarVolume5d,
    recentVolume5dTo20d: recentVolumeRatio, obvLast5dAvgVolumeMultiple,
    pivot1Date: pivot?.firstDate ?? null, pivot1Low: pivot?.firstLow ?? null,
    pivot2Date: pivot?.secondDate ?? null, pivot2Low: pivot?.secondLow ?? null,
    pivotPricePct: pivot?.pricePct ?? null, pivotObvNormalized: pivot?.obvNormalized ?? null,
    alignedObvTroughGainNormalized: pivot?.troughGainNormalized ?? null,
    pivotConfirmedDate: pivot?.confirmedDate ?? null, pivotAgeSessions: pivot?.ageSessions ?? null,
    dataIssues, bars: count, algoVersion: US_OBV_DIVERGENCE_VERSION,
  };
  return { candidate, reason: null };
}

export const US_OBV_DIVERGENCE_PARAMETERS = {
  ...CONFIG,
  maxMarketCapUsd: null,
  timeframe: "D",
  session: "COMPLETED_US_REGULAR_SESSION",
} as const;
