import type { UsDailyCandle } from "@/lib/kis-us-daily-price";

export type UsObvSignalPoint = {
  date: string;
  obv: number;
  signal: number;
  gap: number;
};

export type UsObvSignalAnalysis = {
  points: UsObvSignalPoint[];
  latestObv: number | null;
  latestSignal: number | null;
  previousObv: number | null;
  previousSignal: number | null;
  signalGap: number | null;
  signalGapIncreasing: boolean;
  aboveSignalDays: number;
  aboveSignal: boolean;
  crossedRecently: boolean;
  crossoverDate: string | null;
};

function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  const output: number[] = [];
  for (const [index, value] of values.entries()) {
    output.push(index === 0 ? value : value * alpha + output[index - 1] * (1 - alpha));
  }
  return output;
}

/** Build one continuous OBV series. The series must not be reset per window. */
export function calculateUsObvSeries(candles: UsDailyCandle[]) {
  const ordered = [...candles]
    .filter((candle) => candle.date && Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let obv = 0;
  return ordered.map((candle, index) => {
    if (index > 0) {
      const previous = ordered[index - 1];
      if (candle.close > previous.close) obv += Math.max(0, candle.volume || 0);
      else if (candle.close < previous.close) obv -= Math.max(0, candle.volume || 0);
    }
    return { date: candle.date, obv, close: candle.close, volume: candle.volume };
  });
}

export function analyzeUsObvSignal(
  candles: UsDailyCandle[],
  options: { signalPeriod?: number; consecutiveDays?: number; crossoverLookback?: number } = {},
): UsObvSignalAnalysis {
  const signalPeriod = Math.max(2, Math.floor(options.signalPeriod ?? 9));
  const consecutiveDays = Math.max(1, Math.floor(options.consecutiveDays ?? 3));
  const crossoverLookback = Math.max(1, Math.floor(options.crossoverLookback ?? 5));
  const obvRows = calculateUsObvSeries(candles);
  if (!obvRows.length) {
    return { points: [], latestObv: null, latestSignal: null, previousObv: null, previousSignal: null, signalGap: null, signalGapIncreasing: false, aboveSignalDays: 0, aboveSignal: false, crossedRecently: false, crossoverDate: null };
  }
  const signals = ema(obvRows.map((row) => row.obv), signalPeriod);
  const points = obvRows.map((row, index) => ({ date: row.date, obv: row.obv, signal: signals[index], gap: row.obv - signals[index] }));
  let aboveSignalDays = 0;
  for (let index = points.length - 1; index >= 0 && points[index].obv > points[index].signal; index -= 1) aboveSignalDays += 1;
  let crossoverDate: string | null = null;
  const firstIndex = Math.max(1, points.length - crossoverLookback);
  for (let index = firstIndex; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.obv <= previous.signal && current.obv > current.signal) crossoverDate = current.date;
  }
  const latest = points.at(-1)!;
  const previous = points.at(-2);
  return {
    points,
    latestObv: latest.obv,
    latestSignal: latest.signal,
    previousObv: previous?.obv ?? null,
    previousSignal: previous?.signal ?? null,
    signalGap: latest.gap,
    signalGapIncreasing: previous ? latest.gap > previous.gap : false,
    aboveSignalDays,
    aboveSignal: aboveSignalDays >= consecutiveDays,
    crossedRecently: crossoverDate !== null,
    crossoverDate,
  };
}
