import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { commonStockEligibilitySql } from "@/lib/instrument-eligibility";

type Candle = { date: string; high: number; low: number; close: number; volume: number };
const ema = (v: number[], p: number) => { if (!v.length) return []; const k = 2 / (p + 1); return v.reduce<number[]>((o, x, i) => { o.push(i ? x * k + o[i - 1] * (1 - k) : x); return o; }, []); };
const bands = (v: number[]) => { if (v.length < 20) return null; const w = v.slice(-20); const mid = w.reduce((a, b) => a + b, 0) / 20; const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / 20); return { middle: mid, lower: mid - 2 * sd, upper: mid + 2 * sd }; };
const rvol = (rows: Candle[]) => { const base = rows.slice(-20).reduce((a, x) => a + x.volume, 0) / Math.min(20, rows.length); return base > 0 ? (rows.at(-1)?.volume ?? 0) / base : 0; };
const obv = (rows: Candle[]) => { let n = 0; return rows.map((x, i) => { if (i) n += x.close > rows[i - 1].close ? x.volume : x.close < rows[i - 1].close ? -x.volume : 0; return n; }); };
const adl = (rows: Candle[]) => { let n = 0; return rows.map(x => { const range = x.high - x.low; n += range > 0 ? (((x.close - x.low) - (x.high - x.close)) / range) * x.volume : 0; return n; }); };

export async function scanMultiTimeframeBbRebound(market: "KR" | "US", limit = 30) {
  const universe = market === "KR" ? "kr_instrument_universe" : "us_instrument_universe";
  const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
  const db = getDb();
  const scopes = await db.execute(sql.raw(`SELECT market, code, name FROM ${universe} WHERE ${commonStockEligibilitySql(market)}`));
  const rows = await db.execute(sql.raw(`SELECT market, code, timeframe, candle_date AS date, high, low, close, volume FROM ${candlesTable} WHERE timeframe IN ('D','W','M') AND close IS NOT NULL ORDER BY market, code, timeframe, candle_date`));
  const grouped = new Map<string, { D: Candle[]; W: Candle[]; M: Candle[] }>();
  for (const r of rows.rows as any[]) { const k = `${r.market}:${r.code}`; const g = grouped.get(k) ?? { D: [], W: [], M: [] }; g[r.timeframe as "D" | "W" | "M"].push({ date: String(r.date), high: Number(r.high ?? r.close), low: Number(r.low ?? r.close), close: Number(r.close), volume: Number(r.volume ?? 0) }); grouped.set(k, g); }
  const results = (scopes.rows as any[]).map(s => { const g = grouped.get(`${s.market}:${s.code}`); if (!g || g.D.length < 22 || g.W.length < 20 || g.M.length < 20) return null; const d = g.D, w = g.W, m = g.M; const db = bands(d.map(x => x.close)), wb = bands(w.map(x => x.close)), mb = bands(m.map(x => x.close)); if (!db || !wb || !mb) return null; const latest = d.at(-1)!, previous = d.at(-2)!; const touch = latest.close <= db.lower || previous.close <= (bands(d.slice(0, -1).map(x => x.close))?.lower ?? Infinity); const os = ema(obv(d), 9), as = ema(adl(d), 9); const obvSignalRising = (os.at(-1) ?? 0) > (os.at(-2) ?? 0); const adlSignalRising = (as.at(-1) ?? 0) > (as.at(-2) ?? 0); const recent = d.slice(-3).map((_, i, a) => rvol(d.slice(0, d.length - (a.length - 1 - i)))); const rvolPass = recent.filter(x => x >= 0.5).length >= 2; if (!touch || !obvSignalRising || !adlSignalRising || !rvolPass || w.at(-1)!.close < wb.middle || m.at(-1)!.close < mb.middle) return null; return { market: s.market, code: s.code, name: s.name, latest: { date: latest.date, close: latest.close, volume: latest.volume }, daily: { middle: db.middle, lower: db.lower, touched: previous.close <= db.lower || latest.close <= db.lower }, weekly: { close: w.at(-1)!.close, middle: wb.middle }, monthly: { close: m.at(-1)!.close, middle: mb.middle }, signals: { obvSignal: os.at(-1), previousObvSignal: os.at(-2), adlSignal: as.at(-1), previousAdlSignal: as.at(-2), obvSignalRising, adlSignalRising }, rvol: { recent, minimum: 0.5, qualifyingDays: recent.filter(x => x >= 0.5).length } }; }).filter(Boolean).sort((a: any, b: any) => b.latest.close - a.latest.close).slice(0, Math.max(1, Math.min(limit, 100)));
  return { ok: true, market, instrumentCount: scopes.rows.length, qualifiedCount: results.length, results, policy: { daily: "최근 일봉 BB 하단 터치", weeklyMonthly: "BB 중단선 이상", obvAdl: "OBV·ADL Signal 상승", rvol: "최근 3봉 중 2봉 이상 RVOL 0.5x", eligibility: "official COMMON_STOCK/product/status filter" } };
}
