import "./load-local-env.mjs";
import { Client } from "pg";

const market = process.env.MARKET === "US" ? "US" : "KR";
const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
const lookback = Math.max(60, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 180));
const feeBps = Number(process.env.DAYTRADE_FEE_BPS ?? 20);
const cooldownDays = Math.max(0, Math.trunc(Number(process.env.DAYTRADE_COOLDOWN_DAYS ?? 0)));
const minTurnoverRatio = Math.max(0, Number(process.env.DAYTRADE_MIN_TURNOVER_RATIO ?? 0));

function ema(values, period) { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; }
function signalAt(rows, index, minRvol) {
  if (index < 35) return null;
  const window = rows.slice(0, index + 1), last = window.at(-1), closes = window.map((row) => row.close);
  const e9 = ema(closes, 9), e20 = ema(closes, 20), averageVolume = window.slice(-21, -1).reduce((sum, row) => sum + row.volume, 0) / 20;
  const rvol = averageVolume > 0 ? last.volume / averageVolume : null;
  let obv = 0, adl = 0, obvThreeAgo = 0, adlThreeAgo = 0;
  for (let i = 1; i < window.length; i += 1) { const row = window[i], range = row.high - row.low; obv += row.volume * Math.sign(row.close - window[i - 1].close); adl += range > 0 ? row.volume * ((row.close - row.low) - (row.high - row.close)) / range : 0; if (i === window.length - 3) { obvThreeAgo = obv; adlThreeAgo = adl; } }
  const turnoverRatio = last.marketCap > 0 && last.tradingValue >= 0 ? last.tradingValue / last.marketCap : null;
  if (!(last.close > e9 && e9 > e20 && rvol >= minRvol && last.close > last.open && obv > obvThreeAgo && adl > adlThreeAgo)) return null;
  if (minTurnoverRatio > 0 && !(turnoverRatio !== null && turnoverRatio >= minTurnoverRatio)) return null;
  return { entry: last.close, date: last.date, rvol, turnoverRatio };
}
function outcome(rows, index, target, stop, hold) {
  const entryRow = rows[index + 1];
  if (!entryRow || !(entryRow.open > 0)) return null;
  const entry = entryRow.open, end = Math.min(rows.length - 1, index + hold);
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
  const marketCapJoin = minTurnoverRatio > 0 ? "LEFT JOIN LATERAL (SELECT h.market_cap FROM instrument_fundamental_history h WHERE h.market=c.market AND h.code=c.code AND h.observed_at < (to_date(c.candle_date,'YYYYMMDD') + INTERVAL '1 day') ORDER BY h.observed_at DESC, h.fetched_at DESC LIMIT 1) f ON true" : "";
  const marketTimeZone = market === "KR" ? "Asia/Seoul" : "America/New_York";
  const query = `SELECT c.market,c.code,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume,(c.close*c.volume) AS trading_value,${minTurnoverRatio > 0 ? "f.market_cap" : "NULL::double precision AS market_cap"} FROM ${candlesTable} c JOIN ${universeTable} u ON u.market=c.market AND u.code=c.code ${marketCapJoin} WHERE c.timeframe='D' AND c.candle_date < to_char((CURRENT_TIMESTAMP AT TIME ZONE '${marketTimeZone}')::date,'YYYYMMDD') AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close > 0 AND c.volume > 0 AND ${eligibility} ORDER BY c.market,c.code,c.candle_date`;
  const rows = await client.query(query, [lookback]);
  const grouped = new Map();
  for (const row of rows.rows) { const key = `${row.market}:${row.code}`; const list = grouped.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), tradingValue: Number(row.trading_value ?? 0), marketCap: Number(row.market_cap ?? 0) }); grouped.set(key, list); }
  const grid = []; for (const minRvol of [0.7, 1, 1.2, 1.5]) for (const target of [0.005, 0.01, 0.02, 0.03, 0.05]) for (const stop of [0.005, 0.01, 0.02, 0.03]) for (const hold of [1, 3, 5]) grid.push({ minRvol, target, stop, hold });
  const results = grid.map((config) => { const outcomes = []; for (const list of grouped.values()) { let lastSignalIndex = -Infinity; for (let i = 35; i < list.length - 1; i += 1) { if (i - lastSignalIndex <= cooldownDays) continue; if (signalAt(list, i, config.minRvol)) { const result = outcome(list, i, config.target, config.stop, config.hold); if (result) { outcomes.push(result); lastSignalIndex = i; } } } } const wins = outcomes.filter((item) => item.returnPct > 0).length; const average = outcomes.length ? outcomes.reduce((sum, item) => sum + item.returnPct, 0) / outcomes.length : 0; return { ...config, signals: outcomes.length, wins, winRate: outcomes.length ? wins / outcomes.length : 0, averageReturn: average, totalReturn: outcomes.reduce((sum, item) => sum + item.returnPct, 0) }; }).filter((item) => item.signals >= 30).sort((a, b) => b.totalReturn - a.totalReturn);
  console.log(JSON.stringify({ market, lookbackDays: lookback, feeBps, cooldownDays, minTurnoverRatio, marketCapSource: minTurnoverRatio > 0 ? "instrument_fundamental_history_as_of_signal_date" : "not_required", failClosedWhenHistoryMissing: minTurnoverRatio > 0, instrumentCount: grouped.size, sourceRows: rows.rowCount, tested: results.length, topByTotalReturn: results.slice(0, 10), topByWinRate: [...results].sort((a, b) => b.winRate - a.winRate).slice(0, 10) }, null, 2));
} finally { await client.end(); }
