const { Client } = require('pg');
const ema = (v, p) => { if (v.length < p) return null; let x = v.slice(0, p).reduce((a, b) => a + b, 0) / p; for (let i = p; i < v.length; i += 1) x = v[i] * (2 / (p + 1)) + x * (1 - 2 / (p + 1)); return x; };
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const { rows } = await db.query(`SELECT u.code,c.open,c.high,c.low,c.close,c.volume FROM us_common_stock_universe u JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND u.market='NYS' ORDER BY u.code,c.candle_date`);
  const groups = new Map(); for (const r of rows) { if (!groups.has(r.code)) groups.set(r.code, []); groups.get(r.code).push(r); }
  const combos = []; for (const target of [0.003, 0.005, 0.0075, 0.01]) for (const stop of [0.005, 0.0075, 0.01, 0.015]) combos.push({ target, stop, n: 0, d: 0, w: 0, r: 0 });
  for (const original of groups.values()) {
    const a = original.slice(-301); if (a.length < 40) continue; const closes = a.map(x => +x.close), split = Math.floor(a.length * 0.6);
    for (let i = 30; i < a.length - 6; i += 1) {
      let rising = 0; for (let p = 2; p <= Math.min(365, i + 1); p += 1) { const now = ema(closes.slice(0, i + 1), p), old = ema(closes.slice(0, i - 2), p); if (now && old && Math.abs(closes[i] / now - 1) <= 0.01 && now > old) rising += 1; }
      if (rising < 95) continue; const base = a.slice(i - 20, i).map(x => +x.volume), rv = +a[i].volume / (base.reduce((x, y) => x + y, 0) / 20); if (!(rv >= 1 && rv < 1.2)) continue;
      const entry = +a[i + 1].open, part = i < split ? 'train' : 'test';
      for (const s of combos) { s.n++; let result = null; for (let j = i + 1; j <= i + 5; j += 1) { const up = +a[j].high >= entry * (1 + s.target), down = +a[j].low <= entry * (1 - s.stop); if (up && down) { result = false; break; } if (up) { result = true; break; } if (down) { result = false; break; } } if (result !== null) { s.d++; if (result) { s.w++; s.r += s.target; } else s.r -= s.stop; } }
    }
  }
  console.log(JSON.stringify(combos.map(s => ({ target: s.target, stop: s.stop, decided: s.d, wins: s.w, winRate: s.w / s.d, avgReturn: s.r / s.d })))); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
