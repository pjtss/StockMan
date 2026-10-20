const { Client } = require('pg');

const ema = (values, period) => {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) value = values[i] * alpha + value * (1 - alpha);
  return value;
};

const evaluate = (signals, key, fraction) => {
  const sorted = [...signals].sort((a, b) => b[key] - a[key]);
  const take = Math.max(1, Math.floor(sorted.length * fraction));
  const selected = sorted.slice(0, take).filter(x => x.result !== null);
  const wins = selected.filter(x => x.result).length;
  const avg = selected.length ? selected.reduce((s, x) => s + x.ret, 0) / selected.length : 0;
  return { signals: take, decided: selected.length, wins, winRate: wins / selected.length, avgReturn: avg };
};

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`SELECT u.market,u.code,c.open,c.high,c.low,c.close,c.volume
    FROM us_common_stock_universe u JOIN us_instrument_universe_candles c
    ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
      AND COALESCE(u.is_etf,false)=false AND u.market='NYS'
    ORDER BY u.code,c.candle_date`);
  const groups = new Map();
  for (const row of q.rows) { const k = row.code; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); }
  const signals = [];
  for (const original of groups.values()) {
    const a = original.slice(-301); if (a.length < 50) continue;
    const close = a.map(x => +x.close);
    for (let i = 35; i < a.length - 7; i += 1) {
      const scores = { simple: 0, long: 0, recent: 0, logLong: 0 };
      for (let p = 2; p <= Math.min(365, i + 1); p += 1) {
        const now = ema(close.slice(0, i + 1), p), old = ema(close.slice(0, i - 2), p);
        if (!now || !old || Math.abs(close[i] / now - 1) > 0.01 || now <= old) continue;
        scores.simple += 1;
        scores.long += p / 365;
        scores.recent += 1 / p;
        scores.logLong += Math.log1p(p) / Math.log1p(365);
      }
      const base = a.slice(i - 20, i).map(x => +x.volume);
      const rvol = +a[i].volume / (base.reduce((s, v) => s + v, 0) / 20);
      if (rvol < 1 || rvol >= 1.2 || +a[i + 1].low > close[i] || +a[i + 1].volume < +a[i].volume || +a[i + 1].close <= +a[i + 1].open) continue;
      const entry = +a[i + 1].close; let result = null;
      for (let j = i + 2; j <= i + 6; j += 1) {
        const up = +a[j].high >= entry * 1.01, down = +a[j].low <= entry * 0.99;
        if (up && down) { result = false; break; } if (up) { result = true; break; } if (down) { result = false; break; }
      }
      const ret = result === true ? 0.01 : result === false ? -0.01 : 0;
      signals.push({ ...scores, result, ret });
    }
  }
  const out = { total: signals.length, top10: {}, top20: {} };
  for (const fractionName of ['top10', 'top20']) {
    const fraction = fractionName === 'top10' ? 0.1 : 0.2;
    for (const key of ['simple', 'long', 'recent', 'logLong']) out[fractionName][key] = evaluate(signals, key, fraction);
  }
  console.log(JSON.stringify(out)); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
