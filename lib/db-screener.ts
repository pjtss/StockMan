import { getPool } from "./db";
import type { ScreenerRequest, ScreenerResult } from "./screener-types";
import { evaluateScreenerFilters, rankScreenerResults } from "./screener-engine";

function ema(values: number[], period = 9) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  return values.reduce<number[]>((out, value, index) => {
    out.push(index === 0 ? value : value * alpha + out[index - 1] * (1 - alpha));
    return out;
  }, []);
}

function flowSeries(candles: any[]) {
  let obv = 0;
  let adl = 0;
  const obvs: number[] = [];
  const adls: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const close = Number(candles[i].close);
    const volume = Number(candles[i].volume || 0);
    if (i > 0) obv += volume * Math.sign(close - Number(candles[i - 1].close));
    const high = Number(candles[i].high ?? close);
    const low = Number(candles[i].low ?? close);
    adl += high === low ? 0 : (((close - low) - (high - close)) / (high - low)) * volume;
    obvs.push(obv); adls.push(adl);
  }
  const obvSignal = ema(obvs, 9), adlSignal = ema(adls, 9);
  const trend = (values: number[]) => values.length < 2 ? null : values.at(-1)! > values.at(-2)! ? "RISING" : values.at(-1)! < values.at(-2)! ? "FALLING" : "FLAT";
  return { obvSignalTrend: trend(obvSignal), adlSignalTrend: trend(adlSignal) };
}

export async function runDbScreener(request: ScreenerRequest): Promise<ScreenerResult[]> {
  if (request.market === "ALL") { const [kr, us] = await Promise.all([runDbScreener({ ...request, market: "KR" }), runDbScreener({ ...request, market: "US" })]); return rankScreenerResults([...kr, ...us], request); }
  const pool = getPool(); const isUs = request.market === "US"; const timeframe = request.timeframe ?? "D"; const markets = isUs ? ["NAS", "NYS", "AMS"] : ["KOSPI", "KOSDAQ"]; const universeTable = isUs ? "us_common_stock_universe" : "kr_common_stock_universe"; const candleTable = isUs ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const rows = (await pool.query(`WITH market_latest AS (SELECT market, MAX(candle_date) AS candle_date FROM ${candleTable} WHERE timeframe='D' AND volume > 0 AND market=ANY($1) GROUP BY market), instrument_daily_latest AS (SELECT market,code,MAX(candle_date) AS candle_date FROM ${candleTable} WHERE timeframe='D' AND volume > 0 AND market=ANY($1) GROUP BY market,code) SELECT u.market,u.code,u.name,u.enabled,f.market_cap,f.shares_outstanding,f.currency,c.candle_date,c.fetched_at,c.close,c.high,c.low,c.volume FROM ${universeTable} u LEFT JOIN instrument_fundamental_snapshots f ON f.market=u.market AND f.code=u.code JOIN market_latest ml ON ml.market=u.market JOIN instrument_daily_latest dl ON dl.market=u.market AND dl.code=u.code AND dl.candle_date=ml.candle_date JOIN LATERAL (SELECT * FROM ${candleTable} c WHERE c.market=u.market AND c.code=u.code AND c.timeframe=$2 AND c.volume > 0 ORDER BY c.candle_date DESC LIMIT 30) c ON true WHERE u.enabled=true AND u.daily_active=true AND u.market=ANY($1) ORDER BY u.market,u.code,c.candle_date ASC`, [markets, timeframe])).rows;
  const groups = new Map<string, any>(); for (const row of rows) { const key=`${row.market}:${row.code}`; if(!groups.has(key))groups.set(key,{...row,candles:[]}); groups.get(key).candles.push(row); }
  const results:ScreenerResult[]=[];
  for(const item of groups.values()){if(request.exchange?.length && !request.exchange.includes(item.market))continue; const c=item.candles; if(c.length<20)continue; const closes=c.map((x:any)=>Number(x.close)), last=c.at(-1), prev=c.at(-2); const avg=c.slice(-20,-1).reduce((s:number,x:any)=>s+Number(x.volume||0),0)/19; const mid=closes.slice(-20).reduce((a:number,b:number)=>a+b,0)/20; const sd=Math.sqrt(closes.slice(-20).reduce((a:number,b:number)=>a+(b-mid)**2,0)/20); const lower=mid-2*sd; const prefix=timeframe; const flow=flowSeries(c); const metrics:any={marketCap:item.market_cap==null?null:Number(item.market_cap),[`${prefix}.close`]:Number(last.close),[`${prefix}.high`]:Number(last.high),[`${prefix}.low`]:Number(last.low),[`${prefix}.volume`]:Number(last.volume),[`${prefix}.rvol`]:avg?Number(last.volume)/avg:null,[`${prefix}.bb.upper`]:mid+2*sd,[`${prefix}.bb.middle`]:mid,[`${prefix}.bb.lower`]:lower,[`${prefix}.bb.width`]:mid?(4*sd/mid)*100:null,[`${prefix}.bb.lowerTouch`]:Number(last.low)<=lower,[`${prefix}.bb.lowerBreak`]:Number(last.close)<lower,[`${prefix}.obv.signalTrend`]:flow.obvSignalTrend,[`${prefix}.adl.signalTrend`]:flow.adlSignalTrend}; const evaluation=evaluateScreenerFilters(metrics,request); results.push({market:item.market,exchange:item.market,code:item.code,name:item.name,status:"ACTIVE",marketCap:metrics.marketCap,sharesOutstanding:item.shares_outstanding==null?null:Number(item.shares_outstanding),currency:item.currency,candleDate:last.candle_date,candleFetchedAt:new Date(last.fetched_at).toISOString(),metrics,conditions:evaluation.conditions,matched:evaluation.matched,failureReasons:evaluation.failureReasons}); }
  return rankScreenerResults(results.filter(x=>x.matched),request);
}
