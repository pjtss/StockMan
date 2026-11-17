const { Client } = require('pg');

(async () => {
  const { validDailyCandleSql } = await import('./daily-candle-quality-sql.mjs');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const valid = validDailyCandleSql('l');
    const marketValid = validDailyCandleSql('s');
    const { rows } = await client.query(`
      WITH eligible AS (
        SELECT market,code FROM kr_common_stock_universe
         WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK'
      ), latest AS (
        SELECT l.market,l.code,l.candle_date,l.fetched_at
          FROM kr_latest_daily_candles l WHERE ${valid}
      ), market_latest AS (
        SELECT s.market,MAX(s.candle_date) AS candle_date
          FROM kr_latest_daily_candles s WHERE ${marketValid} GROUP BY s.market
      )
      SELECT e.market,COUNT(*)::int AS total,COUNT(l.code)::int AS with_cache,
             COUNT(*) FILTER(WHERE l.candle_date=ml.candle_date)::int AS on_market_latest,
             COUNT(*) FILTER(WHERE l.code IS NULL)::int AS missing_cache,
             ml.candle_date AS market_latest,MAX(l.fetched_at) AS last_fetched
        FROM eligible e LEFT JOIN latest l ON l.market=e.market AND l.code=e.code
        LEFT JOIN market_latest ml ON ml.market=e.market
       GROUP BY e.market,ml.candle_date ORDER BY e.market`);
    console.log(JSON.stringify(rows));
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
