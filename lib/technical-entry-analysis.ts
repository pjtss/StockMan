import { calculateDmi } from "./us-dmi";
import { latestMacd } from "./us-macd";
import { latestMfi } from "./us-mfi";

export type TechnicalCandle = { date: string; close: number; high: number; low: number; volume: number; updatedAt?: string | null };
export type TechnicalEntryResult = {
  qualifies: boolean; score: number; state: "ENTRY" | "CAUTION" | "EXCLUDED" | "INSUFFICIENT_HISTORY";
  latestDate: string | null; latestUpdatedAt: string | null; candleCount: number;
  indicators: { ema9: number | null; ema20: number | null; emaGoldenCross: boolean; macd: ReturnType<typeof latestMacd>; dmi: ReturnType<typeof calculateDmi>[number] | null; mfi: number | null; rsi: number | null; stochasticK: number | null; stochasticD: number | null; bollingerLower: number | null; close: number | null; volume: number | null; volumeRvol: number | null };
  goldenCross: string[]; approaching: string[]; warnings: string[]; reasons: string[];
};

const ema = (values: number[], period: number) => values.reduce<number[]>((out, value, i) => { out.push(i === 0 ? value : value * (2 / (period + 1)) + out[i - 1] * (1 - 2 / (period + 1))); return out; }, []);
const finite = (v: number | undefined) => Number.isFinite(v) ? v! : null;
function lowerBand(rows: TechnicalCandle[], period = 20) { if (rows.length < period) return null; const values = rows.slice(-period).map(x => x.close), middle = values.reduce((a, b) => a + b, 0) / period, deviation = Math.sqrt(values.reduce((a, b) => a + (b - middle) ** 2, 0) / period); return Number((middle - 2 * deviation).toFixed(6)); }

function rsi(values: number[], period = 14) { if (values.length <= period) return null; let gain = 0, loss = 0; for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); } const rs = loss === 0 ? Infinity : gain / loss; return Number((100 - 100 / (1 + rs)).toFixed(4)); }
function stochastic(rows: TechnicalCandle[], period = 14) { if (rows.length < period) return { k: null, d: null }; const windows = rows.slice(-3).map((_, i) => rows.slice(-(period + 2 - i), rows.length - (2 - i))); const ks = windows.map(w => { const high = Math.max(...w.map(x => x.high)), low = Math.min(...w.map(x => x.low)); return high === low ? 50 : (rows[rows.length - 3 + windows.indexOf(w)].close - low) / (high - low) * 100; }); return { k: Number(ks.at(-1)!.toFixed(4)), d: Number((ks.reduce((a, b) => a + b, 0) / ks.length).toFixed(4)) }; }

export function analyzeTechnicalEntry(candles: TechnicalCandle[], options: { minCandles?: number } = {}): TechnicalEntryResult {
  const rows = [...candles].filter(c => [c.close, c.high, c.low, c.volume].every(Number.isFinite) && c.close > 0 && c.high >= c.low).sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1), previous = rows.at(-2), minCandles = options.minCandles ?? 35;
  const empty = { ema9: null, ema20: null, emaGoldenCross: false, macd: null, dmi: null, mfi: null, rsi: null, stochasticK: null, stochasticD: null, bollingerLower: null, close: latest?.close ?? null, volume: latest?.volume ?? null, volumeRvol: null } as TechnicalEntryResult["indicators"];
  if (rows.length < minCandles) return { qualifies: false, score: 0, state: "INSUFFICIENT_HISTORY", latestDate: latest?.date ?? null, latestUpdatedAt: latest?.updatedAt ?? null, candleCount: rows.length, indicators: empty, goldenCross: [], approaching: [], warnings: ["INSUFFICIENT_HISTORY"], reasons: [] };
  const closes = rows.map(x => x.close), e9 = ema(closes, 9), e20 = ema(closes, 20), macd = latestMacd(rows), dmi = calculateDmi(rows).at(-1) ?? null, mfi = latestMfi(rows), bbLower = lowerBand(rows), stoch = stochastic(rows), avgVolume = rows.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20, rsiValue = rsi(closes);
  const emaCross = Boolean(previous && e9.at(-2)! <= e20.at(-2)! && e9.at(-1)! > e20.at(-1)!);
  const goldenCross = [emaCross && "EMA_9_20", macd?.goldenCross && "MACD", Boolean(dmi && dmi.plusDi > dmi.minusDi && (calculateDmi(rows).at(-2)?.plusDi ?? 0) <= (calculateDmi(rows).at(-2)?.minusDi ?? 0)) && "DMI",].filter(Boolean) as string[];
  const approaching = [e9.at(-1)! <= e20.at(-1)! && e9.at(-1)! > (e9.at(-2) ?? e9.at(-1)!) && "EMA_APPROACHING", macd && !macd.goldenCross && macd.histogramIncreasing && "MACD_APPROACHING",].filter(Boolean) as string[];
  const overbought = (mfi?.value ?? 0) >= 80 || (rsiValue ?? 0) >= 70 || (stoch.k ?? 0) >= 80;
  const rvol = avgVolume > 0 ? latest!.volume / avgVolume : null, warnings = [overbought && "OVERBOUGHT", rvol !== null && rvol < 0.7 && "LOW_VOLUME", dmi && dmi.plusDi > dmi.minusDi && dmi.adx < 20 && "WEAK_TREND"].filter(Boolean) as string[];
  const reasons = [...goldenCross, macd?.bullish && "MACD_BULLISH", Boolean(dmi && dmi.adx >= 20 && dmi.plusDi > dmi.minusDi) && "TREND_CONFIRMED", rvol !== null && rvol >= 1 && "VOLUME_CONFIRMED"].filter(Boolean) as string[];
  const score = Math.max(0, Math.min(100, goldenCross.length * 15 + approaching.length * 8 + (macd?.bullish ? 10 : 0) + (dmi?.plusDi! > dmi?.minusDi! ? 10 : 0) + (dmi?.adx! >= 20 ? 10 : 0) + (rvol !== null && rvol >= 1 ? 10 : 0) - warnings.length * 10));
  const state = warnings.includes("OVERBOUGHT") || warnings.includes("LOW_VOLUME") ? "CAUTION" : score >= 50 ? "ENTRY" : "EXCLUDED";
  return { qualifies: state === "ENTRY", score, state, latestDate: latest!.date, latestUpdatedAt: latest!.updatedAt ?? null, candleCount: rows.length, indicators: { ema9: finite(e9.at(-1)), ema20: finite(e20.at(-1)), emaGoldenCross: emaCross, macd, dmi, mfi: mfi?.value ?? null, rsi: rsiValue, stochasticK: stoch.k, stochasticD: stoch.d, bollingerLower: bbLower, close: latest!.close, volume: latest!.volume, volumeRvol: rvol }, goldenCross, approaching, warnings, reasons };
}
