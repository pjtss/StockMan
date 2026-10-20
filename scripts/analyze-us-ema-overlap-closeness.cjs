const { Client } = require('pg');

const evaluate = (rows, key, fraction) => {
  const selected = [...rows].sort((a, b) => b[key] - a[key]).slice(0, Math.max(1, Math.floor(rows.length * fraction)));
  const decided = selected.filter(x => x.result !== null), wins = decided.filter(x => x.result).length;
  return { signals: selected.length, decided: decided.length, wins, winRate: wins / decided.length, avgReturn: decided.reduce((s, x) => s + x.ret, 0) / decided.length };
};

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`SELECT u.code,c.open,c.high,c.low,c.close,c.volume
    FROM us_common_stock_universe u JOIN us_instrument_universe_candles c
    ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
      AND COALESCE(u.is_etf,false)=false AND u.market='NYS' ORDER BY u.code,c.candle_date`);
  const groups = new Map(); for (const r of q.rows) { if (!groups.has(r.code)) groups.set(r.code, []); groups.get(r.code).push(r); }
  const rows = [];
  for (const original of groups.values()) {
    const a = original.slice(-301); if (a.length < 50) continue; const close = a.map(x => +x.close);
    const e = Array.from({ length: 366 }, () => null);
    for (let i = 0; i < a.length - 7; i += 1) {
      const simple = { count: 0, close: 0, shortClose: 0, longClose: 0 };
      for (let p = 2; p <= Math.min(365, i + 1); p += 1) {
        const alpha = 2 / (p + 1); e[p] = i + 1 === p ? close.slice(0, p).reduce((s, v) => s + v, 0) / p : close[i] * alpha + e[p] * (1 - alpha);
        if (i < 3 || !e[p]) continue; const distance = Math.abs(close[i] / e[p] - 1);
        if (distance <= 0.01) {
          const proximity = 1 - distance / 0.01; simple.count += 1; simple.close += proximity; simple.shortClose += proximity / Math.sqrt(p); simple.longClose += proximity * Math.sqrt(p);
        }
      }
      const base = a.slice(i - 20, i).map(x => +x.volume); if (i < 35 || base.length < 20) continue;
      const rvol = +a[i].volume / (base.reduce((s, v) => s + v, 0) / 20);
      if (rvol < 1 || rvol >= 1.2 || !simple.count) continue;
      const entry = +a[i + 1].open; let result = null;
      for (let j = i + 1; j <= i + 5; j += 1) { const up = +a[j].high >= entry * 1.005, down = +a[j].low <= entry * 0.99; if (up && down) { result = false; break; } if (up) { result = true; break; } if (down) { result = false; break; } }
      rows.push({ ...simple, result, ret: result === true ? 0.005 : result === false ? -0.01 : 0 });
    }
  }
  const out = { total: rows.length, top10: {}, top20: {} };
  for (const [name, fraction] of [['top10', 0.1], ['top20', 0.2]]) for (const key of ['count', 'close', 'shortClose', 'longClose']) out[name][key] = evaluate(rows, key, fraction);
  console.log(JSON.stringify(out)); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
