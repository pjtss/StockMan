export type MacdCandle = { date: string; close: number };
export type MacdPoint = { date: string; macd: number; signal: number; histogram: number };

function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  const output: number[] = [];
  values.forEach((value, index) => { output.push(index === 0 ? value : value * alpha + output[index - 1] * (1 - alpha)); });
  return output;
}

export function calculateMacd(candles: MacdCandle[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  if (![fast, slow, signalPeriod].every((value) => Number.isInteger(value) && value > 0) || fast >= slow) throw new Error("MACD periods are invalid");
  const rows = [...candles].filter((c) => c.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < slow) return [];
  const closes = rows.map((c) => c.close), fastEma = ema(closes, fast), slowEma = ema(closes, slow);
  const macdValues = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const signals = ema(macdValues, signalPeriod);
  return rows.map((row, i) => ({ date: row.date, macd: Number(macdValues[i].toFixed(6)), signal: Number(signals[i].toFixed(6)), histogram: Number((macdValues[i] - signals[i]).toFixed(6)) }));
}

export function latestMacd(candles: MacdCandle[], fast = 12, slow = 26, signalPeriod = 9) {
  const points = calculateMacd(candles, fast, slow, signalPeriod);
  if (!points.length) return null;
  const current = points.at(-1)!;
  const previous = points.at(-2);
  return { ...current, goldenCross: Boolean(previous && previous.macd <= previous.signal && current.macd > current.signal), deathCross: Boolean(previous && previous.macd >= previous.signal && current.macd < current.signal), bullish: current.macd > current.signal };
}
