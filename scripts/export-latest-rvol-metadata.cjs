const fs = require('fs');
const { Client } = require('pg');
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const q = await db.query(`WITH candles AS (
    SELECT c.market,c.code,c.candle_date,c.close,c.volume,
      AVG(c.volume) OVER (PARTITION BY c.market,c.code ORDER BY c.candle_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS avg20
    FROM us_instrument_universe_candles c JOIN us_common_stock_universe u ON u.market=c.market AND u.code=c.code
    WHERE c.timeframe='D' AND u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false
  ), latest_fundamentals AS (
    SELECT DISTINCT ON (market,code) market,code,name,market_cap,currency,source,observed_at
    FROM instrument_fundamental_snapshots ORDER BY market,code,observed_at DESC NULLS LAST,fetched_at DESC
  )
  SELECT c.market,c.code,COALESCE(f.name,u.name) AS name,c.candle_date,c.close,c.volume,c.avg20,
    c.volume/NULLIF(c.avg20,0) AS rvol,COALESCE(f.currency,u.currency) AS currency,f.market_cap,
    u.instrument_type,u.security_type,f.source,f.observed_at
  FROM candles c JOIN us_common_stock_universe u ON u.market=c.market AND u.code=c.code
  LEFT JOIN latest_fundamentals f ON f.market=c.market AND f.code=c.code
  WHERE c.candle_date=(SELECT MAX(candle_date) FROM us_instrument_universe_candles WHERE timeframe='D') AND c.volume/NULLIF(c.avg20,0)>=1
  ORDER BY rvol DESC,c.market,c.code`);
  const headers = ['rank','market','code','name','candle_date','close','volume','avg_volume_20','rvol','currency','market_cap','instrument_type','security_type','fundamental_source','fundamental_observed_at'];
  const lines = [headers.map(csv).join(',')];
  q.rows.forEach((r,i) => lines.push([i+1,r.market,r.code,r.name,r.candle_date,r.close,r.volume,r.avg20,r.rvol,r.currency,r.market_cap,r.instrument_type,r.security_type,r.source,r.observed_at].map(csv).join(',')));
  const out = 'latest-rvol-metadata-20260917.csv'; fs.writeFileSync(out, `\ufeff${lines.join('\n')}`, 'utf8');
  console.log(JSON.stringify({ latest: q.rows[0]?.candle_date ?? null, count: q.rowCount, file: out, preview: q.rows.slice(0,20) }, null, 2)); await db.end();
})().catch(e => { console.error(e); process.exit(1); });
