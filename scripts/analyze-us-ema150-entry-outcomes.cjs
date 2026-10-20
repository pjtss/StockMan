const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT u.market, u.code, c.candle_date, c.high, c.close
    FROM us_common_stock_universe u
    JOIN us_instrument_universe_candles c ON c.market=u.market AND c.code=u.code
      AND c.timeframe='D' AND c.volume>0
    WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
    ORDER BY u.market,u.code,c.candle_date
  `);
  const groups = new Map();
  for (const row of rows) { const key=`${row.market}:${row.code}`; if(!groups.has(key))groups.set(key,{market:row.market,candles:[]}); groups.get(key).candles.push(row); }
  const byMarket = new Map(); let entries=0, reached75=0, below150TwoDays=0, below150AtDay10=0, below150Within10=0, up5High=0, up5Close=0, up3High=0, up3Close=0; const hitCloseGains=[], maxHighGains=[];
  for (const item of groups.values()) {
    const close=item.candles.map(x=>Number(x.close)); const ema75=[],ema150=[];
    for(let i=0;i<close.length;i+=1){ema75.push(i+1<75?null:i+1===75?close.slice(0,75).reduce((a,b)=>a+b,0)/75:close[i]*(2/76)+ema75[i-1]*(74/76));ema150.push(i+1<150?null:i+1===150?close.slice(0,150).reduce((a,b)=>a+b,0)/150:close[i]*(2/151)+ema150[i-1]*(149/151));}
    let e=0,r=0,b=0;
    for(let i=0;i<item.candles.length-10;i+=1){if(ema150[i]==null)continue;const entry=close[i]>=ema150[i]*0.975&&close[i]<=ema150[i]*1.025;if(!entry)continue;e+=1;let hit=false,below=false,belowAny=false,high5=false,close5=false,high3=false,close3=false,firstHitClose=null,maxHigh=-Infinity;for(let j=i+1;j<=i+10;j+=1){const h=Number(item.candles[j].high);maxHigh=Math.max(maxHigh,h);if(h>=close[i]*1.05)high5=true;if(close[j]>=close[i]*1.05)close5=true;if(h>=close[i]*1.03)high3=true;if(close[j]>=close[i]*1.03)close3=true;if(!hit&&ema75[j]!=null&&h>=ema75[j]){hit=true;firstHitClose=close[j];}if(ema150[j]!=null&&close[j]<ema150[j])belowAny=true;if(j+1<item.candles.length&&ema150[j]!=null&&ema150[j+1]!=null&&close[j]<ema150[j]&&close[j+1]<ema150[j+1])below=true;}if(high5)up5High+=1;if(close5)up5Close+=1;if(high3)up3High+=1;if(close3)up3Close+=1;if(belowAny)below150Within10+=1;if(close[i+10]<ema150[i+10])below150AtDay10+=1;if(hit){r+=1;hitCloseGains.push(firstHitClose/close[i]-1);maxHighGains.push(maxHigh/close[i]-1);}if(below)b+=1;}
    if(e){entries+=e;reached75+=r;below150TwoDays+=b;const s=byMarket.get(item.market)||{market:item.market,entries:0,reached75:0,below150TwoDays:0,instruments:0};s.entries+=e;s.reached75+=r;s.below150TwoDays+=b;s.instruments+=1;byMarket.set(item.market,s);}
  }
  const stats=(a)=>{const s=[...a].sort((x,y)=>x-y);return {average:a.length?a.reduce((x,y)=>x+y,0)/a.length:null,median:a.length?s[Math.floor(s.length/2)]:null,p25:a.length?s[Math.floor(s.length*.25)]:null,p75:a.length?s[Math.floor(s.length*.75)]:null};};
  console.log(JSON.stringify({definition:'entry close within EMA150 +/-2.5%; +3% and +5% reached within next 10 trading days',entries,up3High,up3HighProbability:entries?up3High/entries:null,up3Close,up3CloseProbability:entries?up3Close/entries:null,up5High,up5HighProbability:entries?up5High/entries:null,up5Close,up5CloseProbability:entries?up5Close/entries:null,reached75,reach75Probability:entries?reached75/entries:null,below150Within10,below150Within10Probability:entries?below150Within10/entries:null,below150AtDay10,below150AtDay10Probability:entries?below150AtDay10/entries:null,hitCloseGain:stats(hitCloseGains),maxHighGain:stats(maxHighGains),below150TwoDays,below150TwoDaysProbability:entries?below150TwoDays/entries:null,byMarket:[...byMarket.values()].map(x=>({...x,reach75Probability:x.entries?x.reached75/x.entries:null,below150TwoDaysProbability:x.entries?x.below150TwoDays/x.entries:null}))}));
  await client.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
