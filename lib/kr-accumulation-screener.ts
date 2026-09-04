import { getPool } from "./db";

const ema = (values: number[], period: number) => values.reduce<number[]>((out, value, i) => { const k = 2 / (period + 1); out.push(i ? value * k + out[i - 1] * (1 - k) : value); return out; }, []);

export async function runKrAccumulationScreener(limit = 100) {
  const rows = (await getPool().query(`SELECT u.code,u.name,c.market,f.market_cap,c.candle_date,c.open,c.high,c.low,c.close,c.volume
    FROM kr_common_stock_universe u JOIN instrument_fundamental_snapshots f ON f.market=u.market AND f.code=u.code
    JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code
    WHERE u.enabled=true AND u.daily_active=true AND NOT u.is_etp AND NOT u.is_warrant AND NOT u.is_preferred AND NOT u.is_suspended
      AND f.market_cap > 30000000000 AND c.market IN ('KOSPI','KOSDAQ') AND c.timeframe='D' AND c.volume>0
    ORDER BY u.code,c.candle_date`)).rows;
  const groups = new Map<string, any[]>(); for (const row of rows) { if (!groups.has(row.code)) groups.set(row.code, []); groups.get(row.code)!.push(row); }
  const results: any[] = [];
  for (const [code, candles] of groups) {
    if (candles.length < 41) continue;
    const close = candles.map(x => Number(x.close)), volume = candles.map(x => Number(x.volume));
    const e9 = ema(close, 9), e20 = ema(close, 20); let obv = 0, adl = 0; const obvs:number[] = [], adls:number[] = [];
    for (let i=0;i<candles.length;i++) { if (i) obv += volume[i] * Math.sign(close[i] - close[i-1]); const h=Number(candles[i].high),l=Number(candles[i].low); adl += h===l ? 0 : ((close[i]-l)-(h-close[i]))/(h-l)*volume[i]; obvs.push(obv); adls.push(adl); }
    const recent=candles.slice(-5), prior=candles.slice(-25,-5), avg5=recent.reduce((s,x)=>s+Number(x.volume),0)/5, avg20=prior.reduce((s,x)=>s+Number(x.volume),0)/20;
    const bullish=recent.filter(x=>Number(x.close)>Number(x.open)).reduce((s,x)=>s+Number(x.volume),0), bearish=recent.filter(x=>Number(x.close)<Number(x.open)).reduce((s,x)=>s+Number(x.volume),0), last=candles.at(-1)!;
    const turnover5=recent.reduce((s,x)=>s+Number(x.close)*Number(x.volume),0)/5, turnover20=prior.reduce((s,x)=>s+Number(x.close)*Number(x.volume),0)/20;
    const i=close.length-1, priceChange=Math.abs((close[i]-close[i-20])/close[i-20]), rvol=volume[i]/avg20;
    if (obvs[i]>obvs[i-20] && adls[i]>adls[i-20] && rvol>=2) results.push({market:last.market,exchange:last.market,code,name:last.name,status:"ACTIVE",marketCap:Number(last.market_cap),sharesOutstanding:null,currency:"KRW",candleDate:last.candle_date,candleFetchedAt:last.fetched_at,latestDate:last.candle_date,rvol,obvChange20:obvs[i]-obvs[i-20],adlChange20:adls[i]-adls[i-20],turnoverRatio:turnover5/Number(last.market_cap),timeframeMeta:{daily:{date:last.candle_date,updatedAt:last.fetched_at}},metrics:{"D.rvol":rvol,"D.obv.change20":obvs[i]-obvs[i-20],"D.adl.change20":adls[i]-adls[i-20],"D.close":close[i],"D.ema9":e9[i],"D.ema20":e20[i]}});
  }
  return results.sort((a,b)=>b.rvol-a.rvol).slice(0, Math.max(1, Math.min(1000, limit)));
}
