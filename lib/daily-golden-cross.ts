import { writeKisCache } from "@/lib/kis-cache";

export type GoldenCandle = { date: string; close: number; high?: number; low?: number; volume?: number; updatedAt?: string | null };
export type GoldenScope = { market: string; code: string; name?: string };
export type GoldenState = "APPROACHING" | "CROSSED_TODAY" | "RECENT_CROSS" | "ESTABLISHED" | "NONE";
export type GoldenCrossPolicy = {
  shortPeriod?: number; longPeriod?: number; recentCrossLookback?: number; approachingProximityPercent?: number;
  requireObvAboveSignal?: boolean; requireAdlAboveSignal?: boolean; obvSignalPeriod?: number; adlSignalPeriod?: number;
};
export type GoldenCrossResult = GoldenScope & {
  timeframe: "D"; qualifies: boolean; state: GoldenState; latestDate: string | null; previousDate: string | null;
  latestUpdatedAt: string | null; previousUpdatedAt: string | null; dataQuality: "VALID" | "INSUFFICIENT_HISTORY" | "INVALID_INPUT";
  emaShort: number | null; emaLong: number | null; previousEmaShort: number | null; previousEmaLong: number | null;
  crossDate: string | null; obv: number | null; obvSignal: number | null; adl: number | null; adlSignal: number | null;
  obvAboveSignal: boolean; adlAboveSignal: boolean; candleCount: number;
  reason: "APPROACHING" | "CROSSED_TODAY" | "RECENT_CROSS" | "OBV_BELOW_SIGNAL" | "ADL_BELOW_SIGNAL" | "NOT_READY" | "ESTABLISHED" | "INSUFFICIENT_HISTORY";
};
const defaults = { shortPeriod: 9, longPeriod: 20, recentCrossLookback: 5, approachingProximityPercent: 0.5, requireObvAboveSignal: true, requireAdlAboveSignal: true, obvSignalPeriod: 9, adlSignalPeriod: 9 };
function ema(values: number[], period: number) { const alpha = 2 / (period + 1); return values.reduce<number[]>((out, value, index) => { out.push(index === 0 ? value : value * alpha + out[index - 1] * (1 - alpha)); return out; }, []); }
function obvSeries(rows: GoldenCandle[]) { let value = 0; return rows.map((row, index) => { if (index) { const previous = rows[index - 1]; const volume = Number.isFinite(row.volume) ? Number(row.volume) : 0; if (row.close > previous.close) value += volume; else if (row.close < previous.close) value -= volume; } return value; }); }
function adlSeries(rows: GoldenCandle[]) { let value = 0; return rows.map((row) => { const high = Number.isFinite(row.high) ? Number(row.high) : row.close; const low = Number.isFinite(row.low) ? Number(row.low) : row.close; const volume = Number.isFinite(row.volume) ? Number(row.volume) : 0; const range = high - low; value += (range === 0 ? 0 : ((row.close - low) - (high - row.close)) / range) * volume; return value; }); }
function round(value: number | null) { return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6)); }

export function calculateGoldenCross(candles: GoldenCandle[], input: GoldenCrossPolicy = {}): Omit<GoldenCrossResult, "market" | "code" | "name" | "timeframe"> {
  const policy = { ...defaults, ...input };
  const rows = candles.filter((row) => Number.isFinite(row.close) && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const invalidInput = candles.length > 0 && rows.length !== candles.length;
  const minimum = Math.max(policy.longPeriod + 1, policy.obvSignalPeriod + 1, policy.adlSignalPeriod + 1);
  if (rows.length < minimum) return { qualifies: false, state: "NONE", latestDate: rows.at(-1)?.date ?? null, previousDate: rows.at(-2)?.date ?? null, latestUpdatedAt: rows.at(-1)?.updatedAt ?? null, previousUpdatedAt: rows.at(-2)?.updatedAt ?? null, dataQuality: invalidInput ? "INVALID_INPUT" : "INSUFFICIENT_HISTORY", emaShort: null, emaLong: null, previousEmaShort: null, previousEmaLong: null, crossDate: null, obv: null, obvSignal: null, adl: null, adlSignal: null, obvAboveSignal: false, adlAboveSignal: false, candleCount: rows.length, reason: "INSUFFICIENT_HISTORY" };
  const closes = rows.map((row) => row.close), short = ema(closes, policy.shortPeriod), long = ema(closes, policy.longPeriod), obv = obvSeries(rows), adl = adlSeries(rows), obvSignals = ema(obv, policy.obvSignalPeriod), adlSignals = ema(adl, policy.adlSignalPeriod);
  const last = rows.length - 1, previous = last - 1, latestShort = short[last], latestLong = long[last], crossedToday = short[previous] <= long[previous] && latestShort > latestLong;
  let crossIndex: number | null = null; for (let index = last; index > 0; index -= 1) if (short[index - 1] <= long[index - 1] && short[index] > long[index]) { crossIndex = index; break; }
  const crossAge = crossIndex == null ? null : last - crossIndex, recentCross = crossAge != null && crossAge > 0 && crossAge <= policy.recentCrossLookback;
  const distancePercent = latestLong === 0 ? Infinity : Math.abs((latestShort - latestLong) / latestLong) * 100, rising = short[last] > short[Math.max(0, last - 2)], approaching = latestShort <= latestLong && distancePercent <= policy.approachingProximityPercent && rising;
  const state: GoldenState = crossedToday ? "CROSSED_TODAY" : recentCross ? "RECENT_CROSS" : approaching ? "APPROACHING" : latestShort > latestLong ? "ESTABLISHED" : "NONE";
  const obvAboveSignal = obv[last] > obvSignals[last], adlAboveSignal = adl[last] > adlSignals[last], signalReady = (!policy.requireObvAboveSignal || obvAboveSignal) && (!policy.requireAdlAboveSignal || adlAboveSignal);
  const qualifies = ["APPROACHING", "CROSSED_TODAY", "RECENT_CROSS"].includes(state) && signalReady;
  const reason: GoldenCrossResult["reason"] = !["APPROACHING", "CROSSED_TODAY", "RECENT_CROSS"].includes(state) ? state === "ESTABLISHED" ? "ESTABLISHED" : "NOT_READY" : !obvAboveSignal && policy.requireObvAboveSignal ? "OBV_BELOW_SIGNAL" : !adlAboveSignal && policy.requireAdlAboveSignal ? "ADL_BELOW_SIGNAL" : state === "APPROACHING" || state === "CROSSED_TODAY" || state === "RECENT_CROSS" ? state : "NOT_READY";
  return { qualifies, state, latestDate: rows[last].date, previousDate: rows[previous].date, latestUpdatedAt: rows[last].updatedAt ?? null, previousUpdatedAt: rows[previous].updatedAt ?? null, dataQuality: invalidInput ? "INVALID_INPUT" : "VALID", emaShort: round(latestShort), emaLong: round(latestLong), previousEmaShort: round(short[previous]), previousEmaLong: round(long[previous]), crossDate: crossIndex == null ? null : rows[crossIndex].date, obv: round(obv[last]), obvSignal: round(obvSignals[last]), adl: round(adl[last]), adlSignal: round(adlSignals[last]), obvAboveSignal, adlAboveSignal, candleCount: rows.length, reason };
}

export async function persistGoldenCrossResults(scope: "KR" | "US", results: GoldenCrossResult[]) {
  const timeframe = "D", qualified = results.filter((row) => row.qualifies);
  await writeKisCache(`daily-golden-cross:${scope}:${timeframe}`, { scope, timeframe, updatedAt: new Date().toISOString(), policy: { ema: "9/20", recentCrossLookback: 5, states: ["APPROACHING", "CROSSED_TODAY", "RECENT_CROSS"], requiredSignals: ["OBV > OBV Signal", "ADL > ADL Signal"] }, qualifiedCount: qualified.length, qualified, scannedCount: results.length });
  return { qualifiedCount: qualified.length, cached: true, cacheKey: `daily-golden-cross:${scope}:${timeframe}` };
}
