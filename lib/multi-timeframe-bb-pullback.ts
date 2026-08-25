import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { queryEligibleUniverse, eligibilityPolicy } from "@/lib/instrument-eligibility";

type Candle = { date: string; high: number; low: number; close: number };
type Scope = { market: string; code: string; name: string };
const bb = (rows: Candle[]) => { if (rows.length < 20) return null; const w = rows.slice(-20).map((x) => x.close); const middle = w.reduce((s, v) => s + v, 0) / 20; const sd = Math.sqrt(w.reduce((s, v) => s + (v - middle) ** 2, 0) / 20); return { middle, lower: middle - 2 * sd, upper: middle + 2 * sd }; };
// 최신 저장 캔들(진행 중인 일·주·월봉 포함)을 판정에 사용한다.
const completed = (rows: Candle[], _tf: string) => rows;

export type MultiTimeframeBbMode = "pullback" | "all-middle-above";

export async function scanMultiTimeframeBbPullback(market: "KR" | "US", mode: MultiTimeframeBbMode = "pullback") {
  const u = market === "US" ? "us_instrument_universe" : "kr_instrument_universe"; const c = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const eligibility = await queryEligibleUniverse(getDb(), market);
  const scopes = { rows: eligibility.rows };
  const candles = await getDb().execute(sql.raw(`SELECT market,code,timeframe,candle_date AS date,high,low,close FROM ${c} WHERE timeframe IN ('D','W','M') ORDER BY market,code,timeframe,candle_date`));
  const map = new Map<string, { D: Candle[]; W: Candle[]; M: Candle[] }>(); for (const r of candles.rows as any[]) { const k = `${r.market}:${r.code}`; const g = map.get(k) ?? { D: [], W: [], M: [] }; g[r.timeframe as "D" | "W" | "M"].push({ date: String(r.date), high: Number(r.high), low: Number(r.low), close: Number(r.close) }); map.set(k, g); }
  const qualified = (scopes.rows as Scope[]).map((s) => { const g = map.get(`${s.market}:${s.code}`); if (!g) return null; const d = completed(g.D, "D"), w = completed(g.W, "W"), m = completed(g.M, "M"); const db = bb(d), wb = bb(w), mb = bb(m), last = d.at(-1), previous = d.at(-2), wLast = w.at(-1), mLast = m.at(-1); if (!last || !wLast || !mLast || !db || !wb || !mb) return null; const weeklyMiddleToUpper = wLast.close >= wb.middle && wLast.close <= wb.upper; const monthlyMiddleToUpper = mLast.close >= mb.middle && mLast.close <= mb.upper; const dailyAtOrBelowMiddle = last.close <= db.middle; const previousDb = previous ? bb(d.slice(0, -1)) : null; const dailyLowerTouch = last.close <= db.lower || Boolean(previous && previousDb && previous.close <= previousDb.lower); const matches = mode === "all-middle-above" ? last.close >= db.middle && wLast.close >= wb.middle && mLast.close >= mb.middle : weeklyMiddleToUpper && monthlyMiddleToUpper && dailyAtOrBelowMiddle && dailyLowerTouch; if (!matches) return null; return { market: s.market, code: s.code, name: s.name, daily: { date: last.date, close: last.close, bbMiddle: db.middle, bbLower: db.lower, atOrAboveMiddle: last.close >= db.middle, lowerTouch: last.close <= db.lower, lowerTouchDate: last.close <= db.lower ? last.date : previous?.date ?? null }, weekly: { date: wLast.date, close: wLast.close, bbMiddle: wb.middle, bbUpper: wb.upper, middleToUpper: weeklyMiddleToUpper }, monthly: { date: mLast.date, close: mLast.close, bbMiddle: mb.middle, bbUpper: mb.upper, middleToUpper: monthlyMiddleToUpper } }; }).filter(Boolean);
  return { ok: true, market, mode, instrumentCount: scopes.rows.length, qualifiedCount: qualified.length, qualified, policy: { completedCandlesOnly: false, weeklyMonthly: mode === "all-middle-above" ? "latest close at or above BB middle" : "latest close between BB middle and BB upper", daily: mode === "all-middle-above" ? "latest close at or above BB middle" : "latest close <= BB middle AND latest or immediately preceding close touched/broke below its BB lower band", indicators: "BB position only; latest cached close is used as current/last traded price", eligibility: market === "KR" ? eligibilityPolicy.kr : eligibilityPolicy.us } };
}
