import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const lookback = Math.max(60, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 180));
const feeBps = Number(process.env.DAYTRADE_FEE_BPS ?? 20);

function ema(values, period) { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; }
function signalAt(rows, index, minRvol) {
  if (index < 35) return null;
  const window = rows.slice(0, index + 1), last = window.at(-1), closes = window.map((row) => row.close);
  const e9 = ema(closes.slice(-60), 9), e20 = ema(closes.slice(-60), 20), averageVolume = window.slice(-21, -1).reduce((sum, row) => sum + row.volume, 0) / 20;
  const rvol = averageVolume > 0 ? last.volume / averageVolume : null;
  let obv = 0, adl = 0, obvThreeAgo = 0, adlThreeAgo = 0;
  for (let i = 1; i < window.length; i += 1) { obv += window[i].volume * Math.sign(window[i].close - window[i - 1].close); adl += window[i].close >= window[i - 1].close ? window[i].volume : -window[i].volume; if (i === window.length - 3) { obvThreeAgo = obv; adlThreeAgo = adl; } }
  if (!(last.close > e9 && e9 > e20 && rvol >= minRvol && last.close > last.open && obv > obvThreeAgo && adl > adlThreeAgo)) return null;
  return { entry: last.close, date: last.date, rvol };
}
function outcome(rows, index, target, stop, hold) {
  const entry = rows[index].close * (1 + feeBps / 10000), end = Math.min(rows.length - 1, index + hold);
  for (let i = index + 1; i <= end; i += 1) {
    const up = rows[i].high >= entry * (1 + target), down = rows[i].low <= entry * (1 - stop);
    if (up && down) return { result: "STOP", returnPct: -stop - feeBps / 10000 };
    if (up) return { result: "TARGET", returnPct: target - feeBps / 10000 };
    if (down) return { result: "STOP", returnPct: -stop - feeBps / 10000 };
  }
  const exit = rows[end].close;
  return { result: exit >= entry ? "EXPIRED_WIN" : "EXPIRED_LOSS", returnPct: exit / entry - 1 - feeBps / 10000 };
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const eligibility = market === "KR" ? "u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false AND COALESCE(u.trading_halt_code,'') NOT IN ('Y','1') AND COALESCE(u.liquidation_code,'') NOT IN ('Y','1') AND COALESCE(u.managed_issue_code,'') <> 'Y'" : "u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_dr,false)=false AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false";
  const query = `SELECT c.market,c.code,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close > 0 AND c.volume > 0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`;
  const rows = await client.query(query, [lookback]);
  const grouped = new Map();
  for (const row of rows.rows) { const key = `${row.market}:${row.code}`; const list = grouped.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); grouped.set(key, list); }
  const grid = []; for (const minRvol of [0.7, 1, 1.2, 1.5]) for (const target of [0.005, 0.01, 0.02]) for (const stop of [0.005, 0.01]) for (const hold of [1, 3]) grid.push({ minRvol, target, stop, hold });
  const results = grid.map((config) => { const outcomes = []; for (const list of grouped.values()) for (let i = 35; i < list.length - 1; i += 1) { if (signalAt(list, i, config.minRvol)) outcomes.push(outcome(list, i, config.target, config.stop, config.hold)); } const wins = outcomes.filter((item) => item.returnPct > 0).length; const average = outcomes.length ? outcomes.reduce((sum, item) => sum + item.returnPct, 0) / outcomes.length : 0; return { ...config, signals: outcomes.length, wins, winRate: outcomes.length ? wins / outcomes.length : 0, averageReturn: average, totalReturn: outcomes.reduce((sum, item) => sum + item.returnPct, 0) }; }).filter((item) => item.signals >= 30).sort((a, b) => b.totalReturn - a.totalReturn);
  console.log(JSON.stringify({ market, lookbackDays: lookback, feeBps, instrumentCount: grouped.size, sourceRows: rows.rowCount, tested: results.length, topByTotalReturn: results.slice(0, 10), topByWinRate: [...results].sort((a, b) => b.winRate - a.winRate).slice(0, 10) }, null, 2));
} finally { await client.end(); }
