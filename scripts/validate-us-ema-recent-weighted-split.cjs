const { Client } = require('pg');
const score = (a, i) => {
  const close = a.map(x => +x.close), e = Array(366).fill(null); let total = 0;
  for (let j = 0; j <= i; j++) for (let p = 2; p <= Math.min(365, j + 1); p++) {
    const al = 2 / (p + 1); e[p] = j + 1 === p ? close.slice(0, p).reduce((s, v) => s + v, 0) / p : close[j] * al + e[p] * (1 - al);
  }
  for (let p = 2; p <= Math.min(365, i + 1); p++) if (e[p] && Math.abs(close[i] / e[p] - 1) <= .01) total += (1 - Math.abs(close[i] / e[p] - 1) / .01) / Math.sqrt(p);
  return total;
};
const calc = xs => { const d = xs.filter(x => x.result !== null), w = d.filter(x => x.result).length; return {signals: xs.length, decided: d.length, wins: w, winRate: w / d.length, avgReturn: d.reduce((s, x) => s + x.ret, 0) / d.length}; };
(async () => {
  const db = new Client({connectionString: process.env.DATABASE_URL}); await db.connect();
  const q = await db.query(`SELECT u.code,c.candle_date,c.open,c.high,c.low,c.close,c.volume FROM us_common_stock_universe u JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND u.market='NYS' ORDER BY u.code,c.candle_date`);
  const g = new Map(); for (const r of q.rows) { if (!g.has(r.code)) g.set(r.code, []); g.get(r.code).push(r); }
  const all = [], train = [], test = [];
  for (const raw of g.values()) { const a = raw.slice(-301); if (a.length < 60) continue; const cut = Math.floor(a.length * .6);
    for (let i = 35; i < a.length - 7; i++) { const s = score(a, i), base = a.slice(i - 20, i).map(x => +x.volume), rv = +a[i].volume / (base.reduce((x, y) => x + y, 0) / 20); if (!s || rv < 1 || rv >= 1.2 || +a[i + 1].low > +a[i].close) continue;
      const entry = +a[i + 1].open; let result = null; for (let j = i + 1; j <= i + 5; j++) { const up = +a[j].high >= entry * 1.005, dn = +a[j].low <= entry * .99; if (up && dn) { result = false; break; } if (up) { result = true; break; } if (dn) { result = false; break; } }
      const x = {s, result, ret: result === true ? .005 : result === false ? -.01 : 0}; all.push(x); (i < cut ? train : test).push(x);
    }
  }
  const out = {}; for (const [n, xs] of [['all', all], ['train', train], ['test', test]]) { const top = [...xs].sort((a, b) => b.s - a.s).slice(0, Math.max(1, Math.floor(xs.length * .1))); out[n] = calc(top); } console.log(JSON.stringify(out)); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
