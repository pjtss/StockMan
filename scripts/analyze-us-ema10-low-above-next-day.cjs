const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT u.market, u.code, c.candle_date, c.low, c.close, c.volume
    FROM us_common_stock_universe u
    JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code
      AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
    ORDER BY u.market,u.code,c.candle_date
  `);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    if (!groups.has(key)) groups.set(key, { market: row.market, candles: [] });
    groups.get(key).candles.push(row);
  }
  const byMarket = new Map();
  const byRvol = new Map();
  const allGains = [];
  const rvolBucket = (value) => value < 0.5 ? '<0.5' : value < 1 ? '0.5~1' : value < 1.5 ? '1~1.5' : value < 2 ? '1.5~2' : value < 3 ? '2~3' : '3 이상';
  let total = 0, successes = 0;
  for (const item of groups.values()) {
    const closes = item.candles.map((x) => Number(x.close));
    const volumes = item.candles.map((x) => Number(x.volume));
    const ema10 = [];
    for (let i=0;i<closes.length;i+=1) ema10.push(i+1<10?null:i+1===10?closes.slice(0,10).reduce((a,b)=>a+b,0)/10:closes[i]*(2/11)+ema10[i-1]*(9/11));
    let events=0, good=0;
    for (let i=0;i<item.candles.length-1;i+=1) {
      if (ema10[i]==null || ema10[i+1]==null || Number(item.candles[i].low)<=ema10[i]) continue;
      events+=1;
      const rvolBase = volumes.slice(Math.max(0, i - 20), i);
      const rvol = rvolBase.length ? volumes[i] / (rvolBase.reduce((a,b)=>a+b,0) / rvolBase.length) : null;
      const success = Number(item.candles[i+1].low)>ema10[i+1];
      const gain = Number(item.candles[i+1].close) / Number(item.candles[i].close) - 1;
      if (success) good+=1;
      if (rvol != null && Number.isFinite(rvol)) {
        const key = rvolBucket(rvol); const stat = byRvol.get(key) || { bucket:key, events:0, maintained:0 };
        stat.events += 1; if (success) { stat.maintained += 1; stat.gains = stat.gains || []; stat.gains.push(gain); } byRvol.set(key, stat);
      }
      if (success) allGains.push(gain);
    }
    if(events){total+=events;successes+=good;const s=byMarket.get(item.market)||{market:item.market,events:0,successes:0,instruments:0};s.events+=events;s.successes+=good;s.instruments+=1;byMarket.set(item.market,s);}
  }
  const stats = (values) => { const sorted=[...values].sort((a,b)=>a-b); return { average: values.length ? values.reduce((a,b)=>a+b,0)/values.length : null, median: values.length ? sorted[Math.floor(sorted.length/2)] : null, min: values.length ? sorted[0] : null, max: values.length ? sorted.at(-1) : null }; };
  console.log(JSON.stringify({definition:'daily low > EMA10; next trading-day low > next-day EMA10',events:total,successes,probability:total?successes/total:null,gainStats:stats(allGains),byMarket:[...byMarket.values()].map(x=>({...x,probability:x.events?x.successes/x.events:null})),byRvol:[...byRvol.values()].map(x=>{const {gains,...rest}=x;return {...rest,share:total?x.events/total:null,probability:x.events?x.maintained/x.events:null,gainStats:stats(gains||[])}})}));
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
