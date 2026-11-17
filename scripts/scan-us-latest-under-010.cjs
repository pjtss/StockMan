const { Client } = require('pg');

(async () => {
  const { validDailyCandleSql } = await import('./daily-candle-quality-sql.mjs');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const valid = validDailyCandleSql('l');
    const { rows } = await client.query(`
      SELECT u.market,u.code,u.name,l.candle_date,l.close
        FROM us_common_stock_universe u
        JOIN us_latest_daily_candles l ON l.market=u.market AND l.code=u.code
       WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
         AND ${valid} AND l.close<0.10
       ORDER BY u.market,l.close,u.code`);
    const latestByMarket = await client.query(`
      SELECT s.market,MAX(s.candle_date) AS date
        FROM us_latest_daily_candles s
       WHERE ${validDailyCandleSql('s')} GROUP BY s.market ORDER BY s.market`);
    console.log(JSON.stringify({
      latestByMarket: latestByMarket.rows,
      matched: rows.length,
      rows,
      tickers: rows.map((row) => row.code).join(','),
    }));
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
