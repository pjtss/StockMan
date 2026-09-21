import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const days = Math.max(180, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const ema = (values, period) => { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; };
const candidateAt = (rows, index) => {
  if (index < 35) return null;
  const w = rows.slice(0, index + 1), last = w.at(-1), closes = w.map((row) => row.close), e9 = ema(closes.slice(-60), 9), e20 = ema(closes.slice(-60), 20), avgVolume = w.slice(-21, -1).reduce((sum, row) => sum + row.volume, 0) / 20;
  const rvol = avgVolume > 0 ? last.volume / avgVolume : 0;
  let obv = 0, adl = 0, oldObv = 0, oldAdl = 0;
  for (let i = 1; i < w.length; i += 1) { const row = w[i], range = row.high - row.low; obv += row.volume * Math.sign(row.close - w[i - 1].close); adl += range > 0 ? row.volume * ((row.close - row.low) - (row.high - row.close)) / range : 0; if (i === w.length - 3) { oldObv = obv; oldAdl = adl; } }
  const range = last.high - last.low, closeLocation = range > 0 ? (last.close - last.low) / range : 0, emaDistance = e9 > 0 ? last.close / e9 - 1 : 0;
  if (!(last.close > e9 && e9 > e20 && rvol >= 1 && last.close > last.open && obv > oldObv && adl > oldAdl)) return null;
  const obvStrength = avgVolume > 0 ? (obv - oldObv) / avgVolume : 0, adlStrength = avgVolume > 0 ? (adl - oldAdl) / avgVolume : 0;
  return { date: last.date, score: Math.min(rvol, 5) * 20 + closeLocation * 10 - Math.max(emaDistance, 0) * 100 + Math.min(Math.max(obvStrength, 0), 3) * 5 + Math.min(Math.max(adlStrength, 0), 3) * 5 };
};
const outcome = (rows, index) => { const entryRow = rows[index + 1]; if (!entryRow || entryRow.open <= 0) return null; const entry = entryRow.open, up = entryRow.high >= entry * 1.02, down = entryRow.low <= entry * 0.995; if (up && down) return -0.005 - fee; if (up) return 0.02 - fee; if (down) return -0.005 - fee; return entryRow.close / entry - 1 - fee; };
const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
try {
  const eligibility = market === "KR" ? "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false" : "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
  const result = await client.query(`SELECT c.market,c.code,c.candle_date date,c.open,c.high,c.low,c.close,c.volume FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`, [days]);
  const groups = new Map(); for (const row of result.rows) { const key = `${row.market}:${row.code}`; const list = groups.get(key) ?? []; list.push({ code: key, date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); groups.set(key, list); }
  const byDate = new Map(); for (const rows of groups.values()) for (let i = 35; i < rows.length - 1; i += 1) { const candidate = candidateAt(rows, i); if (candidate) { const list = byDate.get(candidate.date) ?? []; list.push({ ...candidate, rows, index: i }); byDate.set(candidate.date, list); } }
  const results = [1, 3, 5, 10, 9999].map((topN) => { const returns = []; for (const candidates of byDate.values()) for (const candidate of candidates.sort((a, b) => b.score - a.score).slice(0, topN)) { const value = outcome(candidate.rows, candidate.index); if (value !== null) returns.push(value); } const wins = returns.filter((value) => value > 0).length; return { topN: Math.min(topN, 9999), signals: returns.length, wins, winRate: returns.length ? wins / returns.length : 0, averageReturn: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0, totalReturn: returns.reduce((sum, value) => sum + value, 0) }; }).sort((a, b) => b.averageReturn - a.averageReturn);
  console.log(JSON.stringify({ market, days, feeBps: fee * 10000, sourceRows: result.rowCount, instruments: groups.size, activeDates: byDate.size, selection: "daily cross-sectional score", target: "2%", stop: "0.5%", results }, null, 2));
} finally { await client.end(); }
