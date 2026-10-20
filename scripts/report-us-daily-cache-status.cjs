const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    WITH eligible AS (
      SELECT market, code FROM us_common_stock_universe
      WHERE enabled = true AND daily_active = true AND instrument_type = 'COMMON_STOCK'
    ), latest AS (
      SELECT DISTINCT ON (market, code) market, code, candle_date, fetched_at
      FROM us_instrument_universe_candles
      WHERE timeframe = 'D' AND volume > 0
      ORDER BY market, code, candle_date DESC, fetched_at DESC
    ), market_latest AS (
      SELECT market, MAX(candle_date) AS candle_date
      FROM us_instrument_universe_candles
      WHERE timeframe = 'D' AND volume > 0
      GROUP BY market
    )
    SELECT e.market, COUNT(*) AS total,
      COUNT(l.code) AS with_cache,
      COUNT(*) FILTER (WHERE l.candle_date = ml.candle_date) AS on_market_latest,
      COUNT(*) FILTER (WHERE l.code IS NULL) AS missing_cache,
      ml.candle_date AS market_latest,
      MAX(l.candle_date) AS latest_any,
      MAX(l.fetched_at) AS last_fetched
    FROM eligible e
    LEFT JOIN latest l ON l.market = e.market AND l.code = e.code
    LEFT JOIN market_latest ml ON ml.market = e.market
    GROUP BY e.market, ml.candle_date
    ORDER BY e.market
  `);
  console.log(JSON.stringify(result.rows));
  await client.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
