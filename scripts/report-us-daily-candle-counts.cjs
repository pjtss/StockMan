const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT u.market, u.code, COUNT(c.candle_date)::int AS candles,
      MIN(c.candle_date) AS first_date, MAX(c.candle_date) AS last_date
    FROM us_common_stock_universe u
    LEFT JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code
      AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
    GROUP BY u.market,u.code
    ORDER BY u.market,candles DESC,u.code
  `);
  const summary = new Map();
  for (const row of rows) {
    const s=summary.get(row.market)||{market:row.market,total:0,over150:0,atLeast150:0,under150:0,min:null,max:null,totalCandles:0};
    const n=Number(row.candles); s.total+=1;s.totalCandles+=n;if(n>150)s.over150+=1;if(n>=150)s.atLeast150+=1;else s.under150+=1;s.min=s.min==null?n:Math.min(s.min,n);s.max=s.max==null?n:Math.max(s.max,n);summary.set(row.market,s);
  }
  for(const s of summary.values()){s.average=s.total?s.totalCandles/s.total:0;s.over150Share=s.total?s.over150/s.total:0;s.atLeast150Share=s.total?s.atLeast150/s.total:0;}
  console.log(JSON.stringify({total:rows.length,byMarket:[...summary.values()]}));
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
