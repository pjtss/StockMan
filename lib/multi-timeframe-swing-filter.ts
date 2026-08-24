import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calculateAdlSeries } from "@/lib/us-adl";
import { calculateUsObvSeries } from "@/lib/us-obv-signal";
import { latestMfi } from "@/lib/us-mfi";
import { latestDmi } from "@/lib/us-dmi";
import { latestMacd } from "@/lib/us-macd";

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
type Scope = { market: string; code: string; name: string };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function ema(values: number[], period: number) { const alpha = 2 / (period + 1); const out: number[] = []; for (const [i, value] of values.entries()) out.push(i ? value * alpha + out[i - 1] * (1 - alpha) : value); return out; }
function a(period: number) { return 2 / (period + 1); }
function bands(c: Candle[], period = 20) { return c.map((x, i) => { if (i < period - 1) return null; const w = c.slice(i - period + 1, i + 1).map((z) => z.close); const m = w.reduce((s, v) => s + v, 0) / period; const sd = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / period); return { upper: m + 2 * sd, middle: m, lower: m - 2 * sd }; }); }
function clean(rows: any[]) { return rows.filter((r) => [r.date, r.open, r.high, r.low, r.close, r.volume].every((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))).map((r) => ({ date: String(r.date), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) })).sort((x, y) => x.date.localeCompare(y.date)); }
function completed(rows: Candle[], timeframe: string) { const now = new Date(); const today = now.toISOString().slice(0, 10).replaceAll("-", ""); const month = today.slice(0, 6); const weekStart = new Date(now); weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)); const ws = weekStart.toISOString().slice(0, 10).replaceAll("-", ""); return rows.filter((r) => timeframe === "D" ? r.date < today : timeframe === "M" ? r.date.slice(0, 6) < month : r.date < ws); }
function weeklyUpperTouched(c: Candle[]) { const b = bands(c); return c.slice(-5).some((x, i) => { const idx = c.length - 5 + i; return b[idx] !== null && x.high >= b[idx]!.upper; }); }
function analyze(scope: Scope, d: Candle[], w: Candle[], m: Candle[]) {
  if (d.length < 100 || w.length < 25 || m.length < 21) return null;
  const db = bands(d), wb = bands(w), mb = bands(m), di = db.at(-1), dpi = db.at(-2), wi = wb.at(-1), wp = wb.at(-2), mi = mb.at(-1), mp = mb.at(-2), last = d.at(-1)!;
  if (!di || !dpi || !wi || !wp || !mi || !mp) return null;
  const e9 = ema(d.map((x) => x.close), 9), e20 = ema(d.map((x) => x.close), 20); const crossDates: string[] = []; for (let i = Math.max(1, d.length - 5); i < d.length; i++) if (e9[i - 1] <= e20[i - 1] && e9[i] > e20[i]) crossDates.push(d[i].date);
  const obv = calculateUsObvSeries(d as any), obvVals = obv.map((x) => x.obv), obvSig = ema(obvVals, 20), adl = calculateAdlSeries(d as any), adlVals = adl.map((x) => x.adl), adlSig = ema(adlVals, 20), md = latestMacd(d), dm = latestDmi(d), mf = latestMfi(d, 14);
  const prevMd = md ? latestMacd(d.slice(0, -1)) : null, kWindow = d.slice(-14), hi = Math.max(...kWindow.map((x) => x.high)), lo = Math.min(...kWindow.map((x) => x.low)), k = hi === lo ? null : (last.close - lo) / (hi - lo) * 100, prevWindow = d.slice(-15, -1), pHi = Math.max(...prevWindow.map((x) => x.high)), pLo = Math.min(...prevWindow.map((x) => x.low)), pk = pHi === pLo ? null : (d.at(-2)!.close - pLo) / (pHi - pLo) * 100, volumeSma = d.slice(-20).reduce((s, x) => s + x.volume, 0) / 20;
  const required = { monthlyAboveMiddle: mi.middle < m.at(-1)!.close, monthlyMiddleRising: mi.middle > mp.middle, weeklyAboveMiddle: wi.middle < w.at(-1)!.close, weeklyMiddleRising: wi.middle > wp.middle, dailyLowerBandTouched: last.low <= di.lower * 1.01, dailyClosedAboveLowerBand: last.close >= di.lower, emaBullish: e9.at(-1)! > e20.at(-1)!, recentGoldenCross: crossDates.length > 0, obvAboveSignal: obv.at(-1)!.obv > obvSig.at(-1)!, adlAboveSignal: adl.at(-1)!.adl > adlSig.at(-1)! };
  if (!Object.values(required).every(Boolean)) return null;
  const bonus = { weeklyUpperTouched: weeklyUpperTouched(w), dmiBullish: !!dm && dm.plusDi > dm.minusDi, macdHistogramRising: !!md && !!prevMd && md.histogram > prevMd.histogram, stochasticBullish: k !== null && pk !== null && k > pk, mfiValid: !!mf && mf.value >= 20 && mf.value <= 60, volumeAboveAverage: last.volume > volumeSma }; const score = Object.values(bonus).filter(Boolean).length; const histogramDelta = md && prevMd ? md.histogram - prevMd.histogram : null;
  return { ticker: scope.code, code: scope.code, name: scope.name, market: scope.market, currentPrice: null, score, daily: { date: last.date, close: last.close, bbUpper: di.upper, bbMiddle: di.middle, bbLower: di.lower, ema9: e9.at(-1), ema20: e20.at(-1), goldenCrossOccurredWithin5Bars: crossDates.length > 0, goldenCrossDate: crossDates.at(-1) ?? null, obv: obv.at(-1)!.obv, obvSignal: obvSig.at(-1), adl: adl.at(-1)!.adl, adlSignal: adlSig.at(-1), plusDI: dm?.plusDi ?? null, minusDI: dm?.minusDi ?? null, adx: dm?.adx ?? null, macd: md?.macd ?? null, macdSignal: md?.signal ?? null, macdHistogram: md?.histogram ?? null, previousMacdHistogram: prevMd?.histogram ?? null, stochasticK: k, stochasticD: pk, mfi: mf?.value ?? null, volume: last.volume, volumeSma20: volumeSma, volumeRatio: volumeSma ? last.volume / volumeSma : null }, weekly: { date: w.at(-1)!.date, close: w.at(-1)!.close, bbUpper: wi.upper, bbMiddle: wi.middle, bbLower: wi.lower, previousBBMiddle: wp.middle, upperTouchedWithin5Bars: bonus.weeklyUpperTouched }, monthly: { date: m.at(-1)!.date, close: m.at(-1)!.close, bbUpper: mi.upper, bbMiddle: mi.middle, bbLower: mi.lower, previousBBMiddle: mp.middle }, requiredConditionsPassed: required, bonusConditions: bonus, histogramDelta };
}

export async function scanMultiTimeframeSwing(market: "KR" | "US") {
  const isUs = market === "US"; const u = isUs ? "us_instrument_universe" : "kr_instrument_universe"; const c = isUs ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const scopeRows = await getDb().execute(sql.raw(`SELECT market, code, name FROM ${u} WHERE enabled = true AND instrument_type = 'COMMON_STOCK' ORDER BY market, code`));
  const candleRows = await getDb().execute(sql.raw(`SELECT market, code, timeframe, candle_date AS date, open, high, low, close, volume FROM ${c} WHERE timeframe IN ('D','W','M') ORDER BY market, code, timeframe, candle_date`));
  const groups = new Map<string, { D: Candle[]; W: Candle[]; M: Candle[] }>(); for (const r of candleRows.rows as any[]) { const k = `${r.market}:${r.code}`; const g = groups.get(k) ?? { D: [], W: [], M: [] }; g[r.timeframe as "D" | "W" | "M"].push(r); groups.set(k, g); }
  const qualified = (scopeRows.rows as Scope[]).map((s) => { const g = groups.get(`${s.market}:${s.code}`) ?? { D: [], W: [], M: [] }; return analyze(s, completed(clean(g.D), "D"), completed(clean(g.W), "W"), completed(clean(g.M), "M")); }).filter(Boolean) as any[];
  qualified.sort((x, y) => y.score - x.score || (y.histogramDelta ?? -Infinity) - (x.histogramDelta ?? -Infinity) || (y.daily.volumeRatio ?? -Infinity) - (x.daily.volumeRatio ?? -Infinity));
  return { ok: true, market, instrumentCount: scopeRows.rows.length, qualifiedCount: qualified.length, qualified, policy: { completedCandlesOnly: true, noCurrentPriceInIndicators: true, timeframeSource: "cached OHLCV D/W/M", requiredConditions: "monthly+weekly BB trend, daily BB support, EMA9/20 recent cross, OBV/ADL above EMA20", bonusMax: 6 } };
}
