import "./load-local-env.mjs";
import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const days = Math.max(180, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const ema = (a, p) => { const k = 2 / (p + 1); let x = a[0]; for (const v of a.slice(1)) x = v * k + x * (1 - k); return x; };
const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
try {
  const eligibility = market === "KR" ? "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false" : "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
  const q = await client.query(`SELECT c.market,c.code,c.candle_date date,c.open,c.high,c.low,c.close,c.volume FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`, [days]);
  const groups = new Map(); for (const row of q.rows) { const key = `${row.market}:${row.code}`; const list = groups.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); groups.set(key, list); }
  const results = [];
  for (const rows of groups.values()) for (let i = 35; i < rows.length - 1; i += 1) { const w = rows.slice(0, i + 1), last = w.at(-1), closes = w.map(x => x.close), e9 = ema(closes, 9), e20 = ema(closes, 20), avg = w.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20; let obv = 0, adl = 0, oldObv = 0, oldAdl = 0; for (let j = 1; j < w.length; j += 1) { const x = w[j], range = x.high - x.low; obv += x.volume * Math.sign(x.close - w[j - 1].close); adl += range > 0 ? x.volume * ((x.close - x.low) - (x.high - x.close)) / range : 0; if (j === w.length - 3) { oldObv = obv; oldAdl = adl; } } if (!(last.close < e9 && e9 < e20 && avg > 0 && last.volume / avg >= 1 && last.close < last.open && obv < oldObv && adl < oldAdl)) continue; const entry = rows[i + 1]; if (!entry || entry.open <= 0) continue; const target = entry.open * 0.98, stop = entry.open * 1.005; const hitTarget = entry.low <= target, hitStop = entry.high >= stop; const ret = hitTarget && hitStop ? -0.005 - fee : hitTarget ? 0.02 - fee : hitStop ? -0.005 - fee : 1 - entry.close / entry.open - fee; results.push(ret); }
  const wins = results.filter(x => x > 0).length;
  console.log(JSON.stringify({ market, days, feeBps: fee * 10000, sourceRows: q.rowCount, instruments: groups.size, side: "SHORT", target: "2%", stop: "0.5%", signals: results.length, wins, winRate: results.length ? wins / results.length : 0, averageReturn: results.length ? results.reduce((s, x) => s + x, 0) / results.length : 0, totalReturn: results.reduce((s, x) => s + x, 0) }, null, 2));
} finally { await client.end(); }
