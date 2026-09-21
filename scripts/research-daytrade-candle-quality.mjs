import "./load-local-env.mjs";
import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const days = Math.max(180, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const ema = (values, period) => { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; };
const signal = (rows, index, minCloseLocation, maxEmaDistance) => {
  if (index < 35) return false;
  const w = rows.slice(0, index + 1), last = w.at(-1), closes = w.map((row) => row.close);
  const e9 = ema(closes, 9), e20 = ema(closes, 20), averageVolume = w.slice(-21, -1).reduce((sum, row) => sum + row.volume, 0) / 20;
  const rvol = averageVolume > 0 ? last.volume / averageVolume : 0;
  let obv = 0, adl = 0, oldObv = 0, oldAdl = 0;
  for (let i = 1; i < w.length; i += 1) { const row = w[i], range = row.high - row.low; obv += row.volume * Math.sign(row.close - w[i - 1].close); adl += range > 0 ? row.volume * ((row.close - row.low) - (row.high - row.close)) / range : 0; if (i === w.length - 3) { oldObv = obv; oldAdl = adl; } }
  const range = last.high - last.low, closeLocation = range > 0 ? (last.close - last.low) / range : 0, emaDistance = e9 > 0 ? last.close / e9 - 1 : 0;
  return last.close > e9 && e9 > e20 && rvol >= 1 && last.close > last.open && obv > oldObv && adl > oldAdl && closeLocation >= minCloseLocation && emaDistance <= maxEmaDistance;
};
const outcome = (rows, index) => { const entryRow = rows[index + 1]; if (!entryRow || entryRow.open <= 0) return null; const entry = entryRow.open; const end = Math.min(rows.length - 1, index + 1); const up = rows[index + 1].high >= entry * 1.01, down = rows[index + 1].low <= entry * 0.995; if (up && down) return -0.005 - fee; if (up) return 0.01 - fee; if (down) return -0.005 - fee; return rows[end].close / entry - 1 - fee; };
const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
try {
  const eligibility = market === "KR" ? "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false" : "u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
  const result = await client.query(`SELECT c.market,c.code,c.candle_date date,c.open,c.high,c.low,c.close,c.volume FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`, [days]);
  const groups = new Map(); for (const row of result.rows) { const key = `${row.market}:${row.code}`; const list = groups.get(key) ?? []; list.push({ open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); groups.set(key, list); }
  const configs = [{ closeLocation: 0, emaDistance: 1 }, { closeLocation: 0.5, emaDistance: 0.03 }, { closeLocation: 0.6, emaDistance: 0.03 }, { closeLocation: 0.75, emaDistance: 0.03 }, { closeLocation: 0.6, emaDistance: 0.05 }];
  const evaluate = (fromRatio, toRatio) => configs.map(({ closeLocation, emaDistance }) => { const returns = []; for (const rows of groups.values()) { const from = Math.max(35, Math.floor(rows.length * fromRatio)), to = Math.min(rows.length - 1, Math.floor(rows.length * toRatio)); for (let i = from; i < to; i += 1) if (signal(rows, i, closeLocation, emaDistance)) { const value = outcome(rows, i); if (value !== null) returns.push(value); } } const wins = returns.filter((value) => value > 0).length; return { closeLocation, maxEmaDistance: emaDistance, signals: returns.length, winRate: returns.length ? wins / returns.length : 0, averageReturn: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0, totalReturn: returns.reduce((sum, value) => sum + value, 0) }; }).filter((item) => item.signals >= 30).sort((a, b) => b.averageReturn - a.averageReturn);
  const train = evaluate(0, 0.6);
  const selected = train.slice(0, 3).map(({ closeLocation, maxEmaDistance }) => ({ closeLocation, emaDistance: maxEmaDistance }));
  const validationConfigs = selected.length ? selected : configs;
  const validation = validationConfigs.map(({ closeLocation, emaDistance }) => { const all = evaluate(0.6, 1).find((item) => item.closeLocation === closeLocation && item.maxEmaDistance === emaDistance); return all; }).filter(Boolean);
  console.log(JSON.stringify({ market, days, feeBps: fee * 10000, sourceRows: result.rowCount, instruments: groups.size, entry: "next session open", target: "1%", stop: "0.5%", trainTop: train.slice(0, 5), validationOfTrainTop: validation }, null, 2));
} finally { await client.end(); }
