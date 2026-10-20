const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const q = await c.query(`WITH z AS (
    SELECT c.market,c.code,c.candle_date,c.close,c.volume,
      AVG(c.volume) OVER (PARTITION BY c.market,c.code ORDER BY c.candle_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS avg20
    FROM us_instrument_universe_candles c JOIN us_common_stock_universe u ON u.market=c.market AND u.code=c.code
    WHERE c.timeframe='D' AND u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false)
    SELECT market,code,candle_date,close,volume,volume/NULLIF(avg20,0) AS rvol FROM z
    WHERE candle_date=(SELECT MAX(candle_date) FROM us_instrument_universe_candles WHERE timeframe='D')
      AND volume/NULLIF(avg20,0)>=1
    ORDER BY rvol DESC,market,code`);
  console.log(JSON.stringify({ count: q.rowCount, rows: q.rows }, null, 2)); await c.end();
})().catch(e => { console.error(e); process.exit(1); });
