const { Client } = require('pg');
const ema = (v, p) => { if (v.length < p) return null; let x=v.slice(0,p).reduce((a,b)=>a+b,0)/p; for(let i=p;i<v.length;i++) x=v[i]*(2/(p+1))+x*(1-2/(p+1)); return x; };
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL}); await db.connect();
  const {rows}=await db.query(`SELECT u.market,u.code,c.candle_date,c.open,c.high,c.low,c.close,c.volume FROM kr_common_stock_universe u JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.volume>0 WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' ORDER BY u.market,u.code,c.candle_date`);
  const groups=new Map(); for(const r of rows){const k=`${r.market}:${r.code}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const defs=[['RVOL 1.2~2 + range압축',r=>r>=1.2&&r<2],['RVOL 1.2~2 + range유지',r=>r>=1.2&&r<2],['RVOL 1~2 + range압축',r=>r>=1&&r<2],['RVOL 0.7~1.5 + range압축',r=>r>=.7&&r<1.5]];
  const out=defs.map(([name])=>({name,signals:0,hit05:0,decided:0,wins:0,losses:0}));
  for(const a of groups.values()){
    if(a.length<55)continue;
    for(let i=30;i<a.length-6;i++){
      const cl=a.slice(0,i+1).map(x=>+x.close),e=ema(cl,10); if(!(+a[i].low>e))continue;
      const vol20=a.slice(i-20,i).map(x=>+x.volume),rv=+a[i].volume/(vol20.reduce((x,y)=>x+y,0)/20);
      const range5=a.slice(i-4,i+1).reduce((s,x)=>s+(+x.high-+x.low)/+x.close,0)/5;
      const range20=a.slice(i-24,i-4).reduce((s,x)=>s+(+x.high-+x.low)/+x.close,0)/20;
      const compressed=range20>0&&range5/range20<1;
      const entry=+a[i+1].open;
      const common=[rv>=1.2&&rv<2,rv>=1&&rv<2,rv>=.7&&rv<1.5];
      for(let k=0;k<out.length;k++){
        const ok=k===0?common[0]&&compressed:k===1?common[0]&&!compressed:k===2?common[1]&&compressed:common[2]&&compressed;
        if(!ok)continue; const s=out[k];s.signals++;if(+a[i+1].high>=entry*1.005)s.hit05++;
        let res=null;for(let j=i+1;j<=i+5;j++){const up=+a[j].high>=entry*1.005,down=+a[j].low<=entry*.99;if(up&&down){res='l';break}if(up){res='w';break}if(down){res='l';break}}if(res){s.decided++;res==='w'?s.wins++:s.losses++}
      }
    }
  }
  console.log(JSON.stringify(out.map(s=>({...s,hitRate:s.hit05/s.signals,stopAwareWinRate:s.wins/s.decided})))); await db.end();
})().catch(e=>{console.error(e);process.exit(1)});
