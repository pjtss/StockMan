import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

type Candle = { date: string; high: number; low: number; close: number };
type Scope = { market: string; code: string; name: string };
const bb = (rows: Candle[]) => { if (rows.length < 20) return null; const w = rows.slice(-20).map((x) => x.close); const middle = w.reduce((s, v) => s + v, 0) / 20; const sd = Math.sqrt(w.reduce((s, v) => s + (v - middle) ** 2, 0) / 20); return { middle, lower: middle - 2 * sd, upper: middle + 2 * sd }; };
const completed = (rows: Candle[], tf: string) => { const now = new Date(); const day = now.toISOString().slice(0, 10).replaceAll("-", ""); const month = day.slice(0, 6); const ws = new Date(now); ws.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)); const week = ws.toISOString().slice(0, 10).replaceAll("-", ""); return rows.filter((r) => tf === "D" ? r.date < day : tf === "M" ? r.date.slice(0, 6) < month : r.date < week); };

export async function scanMultiTimeframeBbPullback(market: "KR" | "US") {
  const u = market === "US" ? "us_instrument_universe" : "kr_instrument_universe"; const c = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const scopes = await getDb().execute(sql.raw(`SELECT market,code,name FROM ${u} WHERE enabled=true AND instrument_type='COMMON_STOCK' ORDER BY market,code`));
  const candles = await getDb().execute(sql.raw(`SELECT market,code,timeframe,candle_date AS date,high,low,close FROM ${c} WHERE timeframe IN ('D','W','M') ORDER BY market,code,timeframe,candle_date`));
  const map = new Map<string, { D: Candle[]; W: Candle[]; M: Candle[] }>(); for (const r of candles.rows as any[]) { const k = `${r.market}:${r.code}`; const g = map.get(k) ?? { D: [], W: [], M: [] }; g[r.timeframe as "D" | "W" | "M"].push({ date: String(r.date), high: Number(r.high), low: Number(r.low), close: Number(r.close) }); map.set(k, g); }
  const qualified = (scopes.rows as Scope[]).map((s) => { const g = map.get(`${s.market}:${s.code}`); if (!g) return null; const d = completed(g.D, "D"), w = completed(g.W, "W"), m = completed(g.M, "M"); const db = bb(d), wb = bb(w), mb = bb(m), last = d.at(-1); if (!last || !db || !wb || !mb || w.at(-1)!.close < wb.middle || m.at(-1)!.close < mb.middle) return null; if (last.low > db.lower * 1.01 || last.close < db.lower) return null; return { market: s.market, code: s.code, name: s.name, daily: { date: last.date, close: last.close, low: last.low, bbLower: db.lower, touchDistancePercent: Number(((last.low / db.lower - 1) * 100).toFixed(4)) }, weekly: { date: w.at(-1)!.date, close: w.at(-1)!.close, bbMiddle: wb.middle }, monthly: { date: m.at(-1)!.date, close: m.at(-1)!.close, bbMiddle: mb.middle } }; }).filter(Boolean);
  return { ok: true, market, instrumentCount: scopes.rows.length, qualifiedCount: qualified.length, qualified, policy: { completedCandlesOnly: true, weeklyMonthly: "close >= BB middle", daily: "low <= BB lower * 1.01 AND close >= BB lower", indicators: "BB only" } };
}
