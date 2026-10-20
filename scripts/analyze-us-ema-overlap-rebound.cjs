const { Client } = require('pg');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`SELECT u.market,u.code,c.candle_date,c.high,c.close FROM us_common_stock_universe u JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false ORDER BY u.market,u.code,c.candle_date`);
  const groups = new Map(); for (const r of q.rows) { const k = `${r.market}:${r.code}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const bins = new Map(); for (let k = 1; k <= 30; k += 1) bins.set(k, { minScore: k, events: 0, rebound: 0 });
  let instruments = 0, maxBars = 0;
  for (const original of groups.values()) {
    const a = original.slice(-301); instruments += 1; maxBars = Math.max(maxBars, original.length); if (a.length < 30) continue;
    const close = a.map(x => +x.close), e = Array(366).fill(null);
    for (let i = 0; i < a.length - 1; i += 1) {
      let score = 0;
      for (let p = 2; p <= Math.min(365, i + 1); p += 1) {
        e[p] = i + 1 === p ? close.slice(0, p).reduce((x, y) => x + y, 0) / p : close[i] * (2 / (p + 1)) + e[p] * (1 - 2 / (p + 1));
        if (Math.abs(close[i] / e[p] - 1) <= 0.01) score += 1;
      }
      if (i < 29 || score === 0) continue;
      const hit = +a[i + 1].high >= close[i] * 1.005;
      for (const s of bins.values()) if (score >= s.minScore) { s.events += 1; if (hit) s.rebound += 1; }
    }
  }
  console.log(JSON.stringify({ instruments, maxBars, bins: [...bins.values()].filter(x => x.events).map(x => ({ ...x, rate: x.rebound / x.events })) })); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
