const { Client } = require('pg');

function ema(values, period) {
  if (values.length < period) return null;
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  for (const item of values.slice(period)) value = item * k + value * (1 - k);
  return value;
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT u.market, u.code, u.name, c.candle_date, c.close
    FROM us_common_stock_universe u
    JOIN us_instrument_universe_candles c
      ON c.market = u.market AND c.code = u.code
      AND c.timeframe = 'D' AND c.volume > 0
    WHERE u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK'
    ORDER BY u.market, u.code, c.candle_date
  `);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    if (!groups.has(key)) groups.set(key, { ...row, candles: [] });
    groups.get(key).candles.push(row);
  }
  const byMarket = new Map();
  let crosses = 0, successes = 0, nextDaySuccesses = 0;
  for (const item of groups.values()) {
    let itemCrosses = 0, itemSuccesses = 0;
    const closes = item.candles.map((x) => Number(x.close));
    const ema10 = [], ema20 = [];
    for (let i = 0; i < closes.length; i += 1) {
      ema10.push(i + 1 < 10 ? null : i + 1 === 10 ? closes.slice(0, 10).reduce((a, b) => a + b, 0) / 10 : closes[i] * (2 / 11) + ema10[i - 1] * (1 - 2 / 11));
      ema20.push(i + 1 < 20 ? null : i + 1 === 20 ? closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20 : closes[i] * (2 / 21) + ema20[i - 1] * (1 - 2 / 21));
    }
    for (let i = 1; i < item.candles.length - 2; i += 1) {
      const prev10 = ema10[i - 1], prev20 = ema20[i - 1];
      const now10 = ema10[i], now20 = ema20[i];
      if (prev10 == null || prev20 == null || now10 == null || now20 == null) continue;
      if (!(prev10 <= prev20 && now10 > now20)) continue;
      itemCrosses += 1;
      const c0 = closes[i], c1 = closes[i + 1], c2 = closes[i + 2];
      if (c1 > c0) nextDaySuccesses += 1;
      if (c1 > c0 && c2 > c1) itemSuccesses += 1;
    }
    if (itemCrosses > 0) {
      crosses += itemCrosses; successes += itemSuccesses;
      const stat = byMarket.get(item.market) ?? { market: item.market, crosses: 0, successes: 0, instruments: 0 };
      stat.crosses += itemCrosses; stat.successes += itemSuccesses; stat.instruments += 1;
      byMarket.set(item.market, stat);
    }
  }
  const result = {
    definition: 'EMA10 crosses above EMA20; next two trading-day closes each rise versus the prior close',
    crosses, successes, probability: crosses ? successes / crosses : null, nextDaySuccesses, nextDayProbability: crosses ? nextDaySuccesses / crosses : null,
    byMarket: [...byMarket.values()].map((x) => ({ ...x, probability: x.crosses ? x.successes / x.crosses : null }))
  };
  console.log(JSON.stringify(result));
  await client.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
