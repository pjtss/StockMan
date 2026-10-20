const { Client } = require('pg');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`SELECT u.market,u.code,c.high,c.low,c.open,c.close FROM us_common_stock_universe u JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false ORDER BY u.market,u.code,c.candle_date`);
  const groups = new Map(); for (const r of q.rows) { const k = `${r.market}:${r.code}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const bins = new Map(); for (let k = 1; k <= 100; k += 1) bins.set(k, { minScore: k, signals: 0, hit05: 0, decided: 0, wins: 0 });
  for (const original of groups.values()) { const a = original.slice(-301); if (a.length < 40) continue; const close = a.map(x => +x.close), current = Array(366).fill(null), history = Array.from({ length: 366 }, () => []);
    for (let i = 0; i < a.length - 6; i += 1) { let score = 0; for (let p = 2; p <= Math.min(365, i + 1); p += 1) { current[p] = i + 1 === p ? close.slice(0, p).reduce((x, y) => x + y, 0) / p : close[i] * (2 / (p + 1)) + current[p] * (1 - 2 / (p + 1)); history[p].push(current[p]); if (i >= 30 && current[p] && history[p][history[p].length - 4] && Math.abs(close[i] / current[p] - 1) <= 0.01 && current[p] > history[p][history[p].length - 4]) score += 1; }
      if (i < 30 || !score) continue; const entry = +a[i + 1].open; if (+a[i + 1].high >= entry * 1.005) for (const s of bins.values()) if (score >= s.minScore) s.hit05++; for (const s of bins.values()) if (score >= s.minScore) { s.signals++; let result = null; for (let j = i + 1; j <= i + 5; j += 1) { const up = +a[j].high >= entry * 1.005, down = +a[j].low <= entry * 0.99; if (up && down) { result = false; break; } if (up) { result = true; break; } if (down) { result = false; break; } } if (result !== null) { s.decided++; if (result) s.wins++; } }
    }
  }
  console.log(JSON.stringify([...bins.values()].filter(x => x.signals).map(x => ({ ...x, hitRate: x.hit05 / x.signals, stopAwareWinRate: x.wins / x.decided })))); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
