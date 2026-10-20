const fs = require('fs');
const { Client } = require('pg');

const ema = (values, period) => {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const alpha = 2 / (period + 1);
  for (const item of values.slice(period)) value = item * alpha + value * (1 - alpha);
  return value;
};
const avg = (values, period) => values.length < period ? null : values.slice(-period).reduce((sum, item) => sum + item, 0) / period;
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT u.market, u.code, u.name, c.candle_date, c.open, c.high, c.low, c.close, c.volume,
           f.market_cap
    FROM us_common_stock_universe u
    JOIN us_instrument_universe_candles c
      ON c.market = u.market AND c.code = u.code AND c.timeframe = 'D' AND c.volume > 0
    LEFT JOIN LATERAL (
      SELECT market_cap
      FROM instrument_fundamental_snapshots f
      WHERE f.market = u.market AND f.code = u.code
      ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST
      LIMIT 1
    ) f ON true
    WHERE u.enabled = true AND u.daily_active = true
      AND u.instrument_type = 'COMMON_STOCK' AND COALESCE(u.is_etf, false) = false
    ORDER BY u.market, u.code, c.candle_date DESC
  `);
  await db.end();

  const grouped = new Map();
  for (const row of rows) {
    if (!(Number(row.market_cap) <= 50_000_000)) continue;
    const key = `${row.market}:${row.code}`;
    if (!grouped.has(key)) grouped.set(key, []);
    const candles = grouped.get(key);
    if (candles.length < 80) candles.push(row);
  }

  const candidates = [];
  for (const source of grouped.values()) {
    const candles = source.reverse();
    if (candles.length < 25) continue;
    const closes = candles.map((row) => Number(row.close));
    const volumes = candles.map((row) => Number(row.volume));
    const i = candles.length - 1;
    const averageVolume20 = avg(volumes.slice(0, i), 20);
    const rvol = averageVolume20 ? volumes[i] / averageVolume20 : 0;
    if (rvol < 1) continue;
    const close = closes[i];
    const ema9 = ema(closes, 9);
    const ema20 = ema(closes, 20);
    const prior20High = Math.max(...closes.slice(-21, -1));
    const oneDayReturn = closes[i - 1] ? close / closes[i - 1] - 1 : 0;
    const fiveDayReturn = closes[i - 6] ? close / closes[i - 6] - 1 : 0;
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const closePosition = (close - low) / ((high - low) || 1);
    const breakout = close >= prior20High;
    const range = (high - low) / close;
    let score = Math.min(rvol, 5) * 12;
    score += Math.max(oneDayReturn, 0) * 100;
    score += Math.max(fiveDayReturn, 0) * 50;
    score += close > ema9 ? 10 : 0;
    score += ema9 > ema20 ? 10 : 0;
    score += breakout ? 15 : 0;
    score += closePosition >= 0.6 ? 8 : 0;
    score += range >= 0.03 ? 8 : 0;
    score += Math.min((close * volumes[i]) / 1_000_000, 10);
    candidates.push({
      market: candles[i].market, code: candles[i].code, name: candles[i].name,
      date: candles[i].candle_date, marketCap: Number(candles[i].market_cap), close,
      volume: volumes[i], rvol, oneDayReturn, fiveDayReturn, ema9, ema20,
      breakout: breakout ? 'Y' : 'N', closePosition, dollarVolume: close * volumes[i], score,
    });
  }
  candidates.sort((a, b) => b.score - a.score || b.rvol - a.rvol);
  const top = candidates.slice(0, 100).map((row, index) => ({ rank: index + 1, ...row }));
  const header = ['rank','market','code','name','as_of','market_cap_usd','close','volume','rvol_sma20','return_1d','return_5d','ema9','ema20','20d_breakout','close_position','dollar_volume','score'];
  const lines = [header.map(csv).join(',')];
  for (const row of top) lines.push([row.rank,row.market,row.code,row.name,row.date,row.marketCap,row.close,row.volume,row.rvol,row.oneDayReturn,row.fiveDayReturn,row.ema9,row.ema20,row.breakout,row.closePosition,row.dollarVolume,row.score].map(csv).join(','));
  const file = 'us-smallcap-surge-top100-20260922.csv';
  fs.writeFileSync(file, '\ufeff' + lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ asOf: top[0]?.date ?? null, eligible: candidates.length, exported: top.length, file, tickers: top.map((row) => row.code).join(',') }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
