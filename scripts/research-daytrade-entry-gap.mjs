import { Client } from "pg";

const fee = Number(process.env.DAYTRADE_FEE_BPS ?? 20) / 10000;
const days = Math.max(120, Number(process.env.DAYTRADE_LOOKBACK_DAYS ?? 360));
const ema = (values, period) => { const k = 2 / (period + 1); let value = values[0]; for (const next of values.slice(1)) value = next * k + value * (1 - k); return value; };
const signal = (rows, i) => {
  const w = rows.slice(0, i + 1), last = w.at(-1), closes = w.map((x) => x.close), e9 = ema(closes, 9), e20 = ema(closes, 20), avgVolume = w.slice(-21, -1).reduce((s, x) => s + x.volume, 0) / 20;
  if (!last || !(last.close > e9 && e9 > e20 && last.close > last.open && last.volume >= avgVolume)) return false;
  let obv = 0, adl = 0, oldObv = 0, oldAdl = 0;
  for (let j = 1; j < w.length; j += 1) { const row = w[j], range = row.high - row.low; obv += row.volume * Math.sign(row.close - w[j - 1].close); adl += range > 0 ? row.volume * ((row.close - row.low) - (row.high - row.close)) / range : 0; if (j === w.length - 3) { oldObv = obv; oldAdl = adl; } }
  return obv > oldObv && adl > oldAdl;
};
const outcome = (rows, i, gap, target, stop) => {
  const entryRow = rows[i + 1];
  if (!entryRow || !(entryRow.open > 0)) return null;
  const entryGap = entryRow.open / rows[i].close - 1;
  if (entryGap < gap.min || entryGap > gap.max) return null;
  const entry = entryRow.open;
  const hit = entryRow.high >= entry * (1 + target), stopped = entryRow.low <= entry * (1 - stop);
  if (hit && stopped) return -stop - fee;
  if (hit) return target - fee;
  if (stopped) return -stop - fee;
  return entryRow.close / entry - 1 - fee;
};

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const query = `SELECT c.market,c.code,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume FROM kr_common_stock_universe u JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code WHERE c.timeframe='D' AND c.candle_date >= to_char(CURRENT_DATE - $1::int,'YYYYMMDD') AND c.close>0 AND c.volume>0 AND u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_suspended,false)=false AND COALESCE(u.trading_halt_code,'') NOT IN ('Y','1') AND COALESCE(u.liquidation_code,'') NOT IN ('Y','1') AND COALESCE(u.managed_issue_code,'') <> 'Y' ORDER BY c.market,c.code,c.candle_date`;
  const grouped = new Map();
  for (const row of (await client.query(query, [days])).rows) { const key = `${row.market}:${row.code}`, list = grouped.get(key) ?? []; list.push({ date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }); grouped.set(key, list); }
  const gaps = [{ name: "any", min: -Infinity, max: Infinity }, { name: "no-gap-down", min: 0, max: Infinity }, { name: "within-0.5pct", min: -0.005, max: 0.005 }, { name: "down-0.5pct-to-flat", min: -0.005, max: 0 }, { name: "up-0-to-0.5pct", min: 0, max: 0.005 }];
  const results = [];
  for (const gap of gaps) for (const target of [0.005, 0.01]) for (const stop of [0.005, 0.01]) {
    const returns = [];
    for (const rows of grouped.values()) for (let i = 35; i < rows.length - 1; i += 1) if (signal(rows, i)) { const result = outcome(rows, i, gap, target, stop); if (result !== null) returns.push(result); }
    if (returns.length >= 30) results.push({ gap: gap.name, target, stop, signals: returns.length, winRate: returns.filter((x) => x > 0).length / returns.length, averageReturn: returns.reduce((s, x) => s + x, 0) / returns.length, totalReturn: returns.reduce((s, x) => s + x, 0) });
  }
  results.sort((a, b) => b.averageReturn - a.averageReturn);
  console.log(JSON.stringify({ market: "KR", days, feeBps: fee * 10000, instruments: grouped.size, results }, null, 2));
} finally { await client.end(); }
