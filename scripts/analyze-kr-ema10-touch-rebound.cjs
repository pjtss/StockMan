const { Client } = require('pg');

const ema = (values, period) => {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  for (const item of values.slice(period)) value = item * k + value * (1 - k);
  return value;
};

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT u.market, u.code, u.name, f.market_cap, c.candle_date, c.open, c.high, c.low, c.close, c.volume
    FROM kr_common_stock_universe u
    JOIN LATERAL (
      SELECT market_cap FROM instrument_fundamental_snapshots f
      WHERE f.market = u.market AND f.code = u.code
      ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST
      LIMIT 1
    ) f ON f.market_cap > 30000000000
    JOIN kr_instrument_universe_candles c
      ON c.market = u.market AND c.code = u.code AND c.timeframe = 'D' AND c.volume > 0
    WHERE u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK'
    ORDER BY u.market, u.code, c.candle_date
  `);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    if (!groups.has(key)) groups.set(key, { ...row, candles: [] });
    groups.get(key).candles.push(row);
  }
  const bucket = (cap) => cap < 100000000000 ? '300억~1,000억' : cap < 1000000000000 ? '1,000억~1조' : cap < 10000000000000 ? '1조~10조' : '10조 이상';
  const results = [];
  for (const period of [10, 20, 25, 60, 75, 150, 365]) {
    let totalTouches = 0, reboundCases = 0, instruments = 0;
    let earliest = null, latest = null;
    for (const item of groups.values()) {
    let touches = 0, rebounds = 0;
    for (let i = 1; i < item.candles.length; i += 1) {
      const priorCloses = item.candles.slice(0, i).map((x) => Number(x.close));
      const priorEma = ema(priorCloses, period);
      const closes = item.candles.slice(0, i + 1).map((x) => Number(x.close));
      const currentEma = ema(closes, period);
      if (priorEma == null || currentEma == null) continue;
      const previous = item.candles[i - 1], current = item.candles[i];
      const wasAbove = Number(previous.close) > priorEma;
      const touched = wasAbove && Number(current.low) <= currentEma;
      if (!touched) continue;
      touches += 1;
      const rebound = Number(current.close) > currentEma && Number(current.close) > Number(current.open);
      if (rebound) rebounds += 1;
      const date = String(current.candle_date).slice(0, 10);
      earliest = earliest == null || date < earliest ? date : earliest;
      latest = latest == null || date > latest ? date : latest;
    }
      if (touches > 0) { instruments += 1; totalTouches += touches; reboundCases += rebounds; }
    }
    const byBucket = new Map();
    for (const item of groups.values()) {
      const cap = Number(item.market_cap);
      const key = bucket(cap);
      if (!byBucket.has(key)) byBucket.set(key, { bucket: key, instruments: 0, totalTouches: 0, reboundCases: 0 });
      const stat = byBucket.get(key);
      let touches = 0, rebounds = 0;
      for (let i = 1; i < item.candles.length; i += 1) {
        const priorCloses = item.candles.slice(0, i).map((x) => Number(x.close));
        const priorEma = ema(priorCloses, period);
        const closes = item.candles.slice(0, i + 1).map((x) => Number(x.close));
        const currentEma = ema(closes, period);
        if (priorEma == null || currentEma == null) continue;
        const previous = item.candles[i - 1], current = item.candles[i];
        if (Number(previous.close) > priorEma && Number(current.low) <= currentEma) {
          touches += 1;
          if (Number(current.close) > currentEma && Number(current.close) > Number(current.open)) rebounds += 1;
        }
      }
      if (touches > 0) { stat.instruments += 1; stat.totalTouches += touches; stat.reboundCases += rebounds; }
    }
    results.push({ period, instruments, totalTouches, reboundCases, probability: totalTouches ? reboundCases / totalTouches : null, earliestCandle: earliest, latestCandle: latest, byBucket: [...byBucket.values()].map((x) => ({ ...x, probability: x.totalTouches ? x.reboundCases / x.totalTouches : null })) });
  }
  let commonTouched = 0, commonFailed = 0;
  const commonByBucket = new Map();
  for (const item of groups.values()) {
    const states = [25, 75, 150, 365].map((period) => {
      let touches = 0, failures = 0;
      for (let i = 1; i < item.candles.length; i += 1) {
        const prior = ema(item.candles.slice(0, i).map((x) => Number(x.close)), period);
        const current = ema(item.candles.slice(0, i + 1).map((x) => Number(x.close)), period);
        if (prior == null || current == null) continue;
        const p = item.candles[i - 1], c = item.candles[i];
        if (Number(p.close) > prior && Number(c.low) <= current) {
          touches += 1;
          if (!(Number(c.close) > current && Number(c.close) > Number(c.open))) failures += 1;
        }
      }
      return { touches, failures };
    });
    if (states.every((x) => x.touches > 0)) {
      commonTouched += 1;
      if (states.every((x) => x.failures > 0)) commonFailed += 1;
      const key = bucket(Number(item.market_cap));
      if (!commonByBucket.has(key)) commonByBucket.set(key, { bucket: key, commonTouched: 0, commonFailed: 0 });
      const stat = commonByBucket.get(key);
      stat.commonTouched += 1;
      if (states.every((x) => x.failures > 0)) stat.commonFailed += 1;
    }
  }
  results.push({ scope: 'instrument', commonTouched, commonFailed, probability: commonTouched ? commonFailed / commonTouched : null, byBucket: [...commonByBucket.values()].map((x) => ({ ...x, probability: x.commonTouched ? x.commonFailed / x.commonTouched : null })) });
  console.log(JSON.stringify(results));
  await client.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
