const { Client } = require('pg');
const ema = (values, period) => { if (values.length < period) return null; let x = values.slice(0, period).reduce((a, b) => a + b, 0) / period; for (let i = period; i < values.length; i += 1) x = values[i] * (2 / (period + 1)) + x * (1 - 2 / (period + 1)); return x; };
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`SELECT u.market,u.code,c.candle_date,c.open,c.high,c.low,c.close,c.volume FROM kr_common_stock_universe u JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' ORDER BY u.market,u.code,c.candle_date`);
  const groups = new Map(); for (const r of q.rows) { const k = `${r.market}:${r.code}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const stats = new Map(); for (let p = 1; p <= 365; p += 1) stats.set(p, { period: p, events: 0, rebound: 0 });
  const scoreStats = new Map(); for (let k = 1; k <= 365; k += 1) scoreStats.set(k, { minScore: k, events: 0, rebound: 0 });
  const weightedStats = new Map(); for (let k = 1; k <= 365; k += 1) weightedStats.set(k, { minScore: k, events: 0, rebound: 0 });
  let maxBars = 0, instruments = 0;
  for (const a of groups.values()) {
    instruments += 1; maxBars = Math.max(maxBars, a.length); if (a.length < 12) continue;
    const closes = a.map(x => +x.close);
    for (let i = 10; i < a.length - 1; i += 1) {
      const hits = []; let score = 0;
      for (let p = 1; p <= Math.min(365, i + 1); p += 1) { const e = ema(closes.slice(0, i + 1), p); if (e && Math.abs(closes[i] / e - 1) <= 0.01) { hits.push(p); score += 1; } }
      if (!hits.length) continue;
      const weighted = hits.reduce((s, p) => s + Math.log1p(p), 0);
      const rebound = +a[i + 1].high >= closes[i] * 1.005;
      for (let k = 1; k <= 365; k += 1) { const s = scoreStats.get(k); if (score >= k) { s.events += 1; if (rebound) s.rebound += 1; } const w = weightedStats.get(k); if (weighted >= k) { w.events += 1; if (rebound) w.rebound += 1; } }
      for (const p of hits) { const s = stats.get(p); s.events += 1; if (rebound) s.rebound += 1; }
    }
  }
  const topPeriods = [...stats.values()].filter(x => x.events >= 500).map(x => ({ ...x, rate: x.rebound / x.events })).sort((a,b) => b.rate-a.rate).slice(0, 20);
  const topCounts = [...scoreStats.values()].filter(x => x.events >= 500).map(x => ({ ...x, rate: x.rebound / x.events })).sort((a,b) => b.rate-a.rate).slice(0, 15);
  const topWeighted = [...weightedStats.values()].filter(x => x.events >= 500).map(x => ({ ...x, rate: x.rebound / x.events })).sort((a,b) => b.rate-a.rate).slice(0, 15);
  console.log(JSON.stringify({ instruments, maxBars, topPeriods, topCounts, topWeighted })); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
