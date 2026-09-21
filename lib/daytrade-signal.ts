export type DayTradeCandle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type DayTradeSignal = { qualifies: boolean; state: "QUALIFIED" | "WATCH" | "REJECTED" | "INSUFFICIENT_HISTORY"; score: number; signalDate: string | null; entryReference: number | null; indicators: { ema9: number | null; ema20: number | null; rvol: number | null; obvSlope: number | null; adlSlope: number | null; bbLower: number | null }; reasons: string[]; warnings: string[] };

const ema = (values: number[], period: number) => { if (!values.length) return []; const k = 2 / (period + 1); const result = [values[0]]; for (const value of values.slice(1)) result.push(value * k + result.at(-1)! * (1 - k)); return result; };
const lowerBand = (values: number[], period = 20) => { if (values.length < period) return null; const window = values.slice(-period); const mean = window.reduce((sum, value) => sum + value, 0) / period; const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period); return mean - deviation * 2; };
const slope = (values: number[]) => values.length >= 3 ? values.at(-1)! - values.at(-3)! : null;

/** Conservative completed-daily-bar candidate. Entry is next session, never the signal close. */
export function evaluateDayTradeSignal(candles: DayTradeCandle[], options: { minCandles?: number; minRvol?: number; minTurnoverRatio?: number; marketCap?: number; tradingValue?: number } = {}): DayTradeSignal {
  const rows = candles.filter((row) => [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite) && row.close > 0 && row.high >= row.low && row.volume >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const empty = { ema9: null, ema20: null, rvol: null, obvSlope: null, adlSlope: null, bbLower: null };
  if (rows.length < (options.minCandles ?? 35)) return { qualifies: false, state: "INSUFFICIENT_HISTORY", score: 0, signalDate: rows.at(-1)?.date ?? null, entryReference: rows.at(-1)?.close ?? null, indicators: empty, reasons: [], warnings: ["INSUFFICIENT_HISTORY"] };
  const closes = rows.map((row) => row.close), e9 = ema(closes, 9), e20 = ema(closes, 20), last = rows.at(-1)!;
  const priorVolumes = rows.slice(-21, -1).map((row) => row.volume), averageVolume = priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length, rvol = averageVolume > 0 ? last.volume / averageVolume : null;
  const obv = [0], adl = [0];
  for (let i = 1; i < rows.length; i += 1) { obv.push(obv.at(-1)! + rows[i].volume * Math.sign(rows[i].close - rows[i - 1].close)); adl.push(adl.at(-1)! + (rows[i].close >= rows[i - 1].close ? rows[i].volume : -rows[i].volume)); }
  const obvSlope = slope(obv), adlSlope = slope(adl), bbLower = lowerBand(closes), reasons: string[] = [], warnings: string[] = [];
  let score = 0;
  const add = (condition: boolean, points: number, reason: string, warning: string) => { if (condition) { score += points; reasons.push(reason); } else warnings.push(warning); };
  add(last.close > e9.at(-1)!, 20, "CLOSE_ABOVE_EMA9", "CLOSE_NOT_ABOVE_EMA9");
  add(e9.at(-1)! > e20.at(-1)!, 20, "EMA9_ABOVE_EMA20", "EMA_TREND_NOT_CONFIRMED");
  add(rvol !== null && rvol >= (options.minRvol ?? 1), 20, "RVOL_CONFIRMED", "RVOL_BELOW_THRESHOLD");
  add(last.close > last.open, 10, "BULLISH_CLOSE", "NOT_BULLISH_CLOSE");
  add(obvSlope !== null && obvSlope > 0, 15, "OBV_RISING", "OBV_NOT_RISING");
  add(adlSlope !== null && adlSlope > 0, 15, "ADL_RISING", "ADL_NOT_RISING");
  if (options.marketCap && options.tradingValue && options.marketCap > 0 && options.tradingValue / options.marketCap < (options.minTurnoverRatio ?? 0)) warnings.push("TURNOVER_BELOW_THRESHOLD");
  const qualifies = reasons.length === 6;
  return { qualifies, state: qualifies ? "QUALIFIED" : score >= 50 ? "WATCH" : "REJECTED", score, signalDate: last.date, entryReference: last.close, indicators: { ema9: e9.at(-1)!, ema20: e20.at(-1)!, rvol, obvSlope, adlSlope, bbLower }, reasons, warnings };
}
