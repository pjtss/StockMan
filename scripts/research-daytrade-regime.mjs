import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const days = Math.max(180, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const ema = (values, period) => { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; };
const eligibility = market === "KR" ? "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false" : "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(`SELECT c.market,c.code,c.candle_date date,c.open,c.high,c.low,c.close,c.volume FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`, [days]);
  const groups = new Map();
  for (const row of result.rows) { const key = `${row.market}:${row.code}`; const list = groups.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); groups.set(key, list); }
  const breadth = new Map();
  for (const rows of groups.values()) for (let i = 35; i < rows.length - 1; i += 1) { const date = rows[i].date; const closes = rows.slice(0, i + 1).map((x) => x.close); const current = ema(closes.slice(-60), 20); const prior = ema(closes.slice(-65, -5), 20); const state = breadth.get(date) ?? { total: 0, rising: 0 }; state.total += 1; if (current > prior && rows[i].close > current) state.rising += 1; breadth.set(date, state); }
  const stats = new Map();
  for (const rows of groups.values()) for (let i = 35; i < rows.length - 1; i += 1) { const w = rows.slice(0, i + 1), last = w.at(-1), closes = w.map((x) => x.close), e9 = ema(closes.slice(-60), 9), e20 = ema(closes.slice(-60), 20), avg = w.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20; let obv = 0, adl = 0, oldObv = 0, oldAdl = 0; for (let j = 1; j < w.length; j += 1) { const x = w[j], range = x.high - x.low; obv += x.volume * Math.sign(x.close - w[j - 1].close); adl += range > 0 ? x.volume * ((x.close - x.low) - (x.high - x.close)) / range : 0; if (j === w.length - 3) { oldObv = obv; oldAdl = adl; } } const rv = avg > 0 ? last.volume / avg : 0; if (!(last.close > e9 && e9 > e20 && rv >= 1 && last.close > last.open && obv > oldObv && adl > oldAdl)) continue; const b = breadth.get(last.date) ?? { total: 0, rising: 0 }; const regime = b.total && b.rising / b.total >= 0.55 ? "BULL" : b.total && b.rising / b.total <= 0.35 ? "BEAR" : "NEUTRAL"; const entry = rows[i + 1]; if (!entry || entry.open <= 0) continue; const up = entry.high >= entry.open * 1.02, down = entry.low <= entry.open * 0.995; const ret = up && down ? -0.005 - fee : up ? 0.02 - fee : down ? -0.005 - fee : entry.close / entry.open - 1 - fee; const s = stats.get(regime) ?? { regime, signals: 0, wins: 0, sum: 0, breadthDays: 0 }; s.signals += 1; s.wins += ret > 0 ? 1 : 0; s.sum += ret; stats.set(regime, s); }
  const regimes = [...stats.values()].map((s) => ({ ...s, winRate: s.signals ? s.wins / s.signals : 0, averageReturn: s.signals ? s.sum / s.signals : 0 })).sort((a, b) => b.averageReturn - a.averageReturn);
  console.log(JSON.stringify({ market, days, feeBps: fee * 10000, sourceRows: result.rowCount, instruments: groups.size, breadthDefinition: "close above rising EMA20; BULL >=55%, BEAR <=35%", target: "2%", stop: "0.5%", regimes }, null, 2));
} finally { await client.end(); }
