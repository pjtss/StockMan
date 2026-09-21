import { Client } from "pg";

const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const days = Math.max(120, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const ema = (values, period) => { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; };
const metrics = (rows, index, variant) => {
  const window = rows.slice(0, index + 1), closes = window.map((x) => x.close), last = window.at(-1);
  const e9 = ema(closes, 9), e20 = ema(closes, 20);
  const previous = window.at(-2);
  if (!last || !previous || !(last.open > 0) || !(last.low > 0)) return false;
  if (variant === "trend") return last.close > e9 && e9 > e20 && last.close > last.open && last.volume >= window.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20;
  if (variant === "ema9-reclaim") return e9 > e20 && last.low <= e9 && last.close > e9 && last.close > last.open && last.volume >= window.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20;
  return e9 > e20 && last.low <= e20 * 1.01 && last.close > last.open && last.close > previous.close && last.volume >= window.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20;
};
const outcome = (rows, index, target, stop, hold) => {
  const entryRow = rows[index + 1];
  if (!entryRow || !(entryRow.open > 0)) return null;
  const entry = entryRow.open, end = Math.min(rows.length - 1, index + hold);
  for (let i = index + 1; i <= end; i += 1) {
    const hit = rows[i].high >= entry * (1 + target), stopped = rows[i].low <= entry * (1 - stop);
    if (hit && stopped) return -stop - fee;
    if (hit) return target - fee;
    if (stopped) return -stop - fee;
  }
  return rows[end].close / entry - 1 - fee;
};

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const query = `SELECT c.market,c.code,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume FROM kr_common_stock_universe u JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false AND COALESCE(u.trading_halt_code,'') NOT IN ('Y','1') AND COALESCE(u.liquidation_code,'') NOT IN ('Y','1') AND COALESCE(u.managed_issue_code,'') <> 'Y' ORDER BY c.market,c.code,c.candle_date`;
  const grouped = new Map();
  for (const row of (await client.query(query, [days])).rows) { const key = `${row.market}:${row.code}`, list = grouped.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); grouped.set(key, list); }
  const variants = ["trend", "ema9-reclaim", "ema20-reversal"];
  const results = [];
  for (const variant of variants) for (const target of [0.005, 0.01]) for (const stop of [0.005, 0.01]) for (const hold of [1, 3]) {
    const returns = [];
    for (const rows of grouped.values()) for (let i = 35; i < rows.length - 1; i += 1) if (metrics(rows, i, variant)) { const result = outcome(rows, i, target, stop, hold); if (result !== null) returns.push(result); }
    if (returns.length < 30) continue;
    results.push({ variant, target, stop, hold, signals: returns.length, winRate: returns.filter((x) => x > 0).length / returns.length, averageReturn: returns.reduce((s, x) => s + x, 0) / returns.length, totalReturn: returns.reduce((s, x) => s + x, 0) });
  }
  results.sort((a, b) => b.averageReturn - a.averageReturn);
  console.log(JSON.stringify({ market: "KR", days, feeBps: fee * 10000, instruments: grouped.size, variants: results }, null, 2));
} finally { await client.end(); }
