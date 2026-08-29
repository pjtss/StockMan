import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { queryEligibleUniverse } from "@/lib/instrument-eligibility";

type Candle = { date: string; updatedAt: string | null; high: number; low: number; close: number; volume: number };
const ema = (values: number[], period = 9) => { const k = 2 / (period + 1); return values.reduce<number[]>((out, value, i) => { out.push(i ? value * k + out[i - 1] * (1 - k) : value); return out; }, []); };
const obv = (rows: Candle[]) => { let value = 0; return rows.map((row, i) => (i && (value += row.close > rows[i - 1].close ? row.volume : row.close < rows[i - 1].close ? -row.volume : 0), value)); };
const adl = (rows: Candle[]) => { let value = 0; return rows.map(row => { const range = row.high - row.low; value += range ? ((2 * row.close - row.high - row.low) / range) * row.volume : 0; return value; }); };
const rising = (values: number[]) => values.at(-1)! > values.at(-2)! && values.at(-2)! > values.at(-3)! && values.at(-3)! > values.at(-4)!;

export async function scanUsDailySidewaysObvAdl() {
  const db = getDb();
  const universe = await queryEligibleUniverse(db, "US");
  const candles = await db.execute(sql.raw("SELECT market,code,candle_date AS date,high,low,close,volume,fetched_at FROM us_instrument_universe_candles WHERE timeframe='D' AND close IS NOT NULL ORDER BY market,code,candle_date"));
  const byInstrument = new Map<string, Candle[]>();
  for (const row of candles.rows as any[]) { const key = `${row.market}:${row.code}`; const list = byInstrument.get(key) ?? []; list.push({ date: String(row.date), updatedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : null, high: +(row.high ?? row.close), low: +(row.low ?? row.close), close: +row.close, volume: +(row.volume ?? 0) }); byInstrument.set(key, list); }
  const results: any[] = [];
  for (const instrument of universe.rows as any[]) { const rows = byInstrument.get(`${instrument.market}:${instrument.code}`) ?? []; if (rows.length < 30) continue; const window = rows.slice(-20), high = Math.max(...window.map(row => row.high)), low = Math.min(...window.map(row => row.low)), midpoint = (high + low) / 2, latest = window.at(-1)!; const obvSignal = ema(ema(obv(rows))), adlSignal = ema(ema(adl(rows))); if (((high - low) / midpoint) * 100 <= 15 && Math.abs(latest.close - midpoint) / midpoint <= 0.05 && rising(obvSignal) && rising(adlSignal)) results.push({ market: instrument.market, code: instrument.code, name: instrument.name, latestCandle: { tradingDate: latest.date, updatedAt: latest.updatedAt }, latestCandleDate: latest.date, latestCandleUpdatedAt: latest.updatedAt, close: latest.close, rangePercent: +(((high - low) / midpoint) * 100).toFixed(2), obvSignalTrend: "3일 연속 상승", adlSignalTrend: "3일 연속 상승" }); }
  return { ok: true, market: "US", instrumentCount: universe.rows.length, qualifiedCount: results.length, results, policy: { sidewaysRangePercentMax: 15, closeMidpointTolerancePercent: 5, obvAdlSignalRisingDays: 3, eligibility: "official COMMON_STOCK/product/status filter" } };
}
