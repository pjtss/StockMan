const { Client } = require('pg');

const ema = (values, period) => {
  if (values.length < period) return null;
  let out = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) out = values[i] * (2 / (period + 1)) + out * (1 - 2 / (period + 1));
  return out;
};

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT u.market,u.code,c.candle_date,c.open,c.high,c.low,c.close,c.volume
    FROM kr_common_stock_universe u
    JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code
      AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
    ORDER BY u.market,u.code,c.candle_date`);
  const groups = new Map();
  for (const row of rows) { const key = `${row.market}:${row.code}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const buckets = [
    ['<0.7', -Infinity, 0.7], ['0.7~1', 0.7, 1], ['1~1.2', 1, 1.2],
    ['1.2~1.5', 1.2, 1.5], ['1.5~2', 1.5, 2], ['2~3', 2, 3], ['3+', 3, Infinity],
  ];
  const stats = new Map(buckets.map(([label]) => [label, { rvol: label, signals: 0, hit05: 0, holdEma10: 0, decided: 0, wins: 0, losses: 0 }]));
  for (const candles of groups.values()) {
    if (candles.length < 35) continue;
    for (let i = 30; i < candles.length - 6; i += 1) {
      const closes = candles.slice(0, i + 1).map(x => Number(x.close));
      const e10 = ema(closes, 10);
      if (!(Number(candles[i].low) > e10)) continue;
      const baseline = candles.slice(i - 20, i).map(x => Number(x.volume));
      const avg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
      const rv = avg > 0 ? Number(candles[i].volume) / avg : null;
      if (!Number.isFinite(rv)) continue;
      const bucket = buckets.find(([, lo, hi]) => rv >= lo && rv < hi)?.[0];
      if (!bucket) continue;
      const s = stats.get(bucket); s.signals += 1;
      const entry = Number(candles[i + 1].open);
      if (Number(candles[i + 1].high) >= entry * 1.005) s.hit05 += 1;
      const nextCloses = candles.slice(0, i + 2).map(x => Number(x.close));
      const nextE10 = ema(nextCloses, 10);
      if (Number(candles[i + 1].low) > nextE10) s.holdEma10 += 1;
      let result = null;
      for (let j = i + 1; j <= i + 5; j += 1) {
        const up = Number(candles[j].high) >= entry * 1.005;
        const down = Number(candles[j].low) <= entry * 0.99;
        if (up && down) { result = 'loss'; break; }
        if (up) { result = 'win'; break; }
        if (down) { result = 'loss'; break; }
      }
      if (result) { s.decided += 1; if (result === 'win') s.wins += 1; else s.losses += 1; }
    }
  }
  console.log(JSON.stringify([...stats.values()].map(s => ({ ...s, hitRate: s.hit05 / s.signals, holdRate: s.holdEma10 / s.signals, stopAwareWinRate: s.wins / s.decided }))));
  await db.end();
})().catch(error => { console.error(error); process.exit(1); });
