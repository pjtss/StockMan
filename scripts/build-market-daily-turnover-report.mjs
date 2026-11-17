import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { readLocalEnvFile } from "./local-env.mjs";

Object.assign(process.env, readLocalEnvFile(resolve(process.cwd(), ".env.local")));
const { Client } = pg;
const outputPath = resolve(process.cwd(), process.argv[2] ?? "reports/market-daily-turnover.html");
const days = Number(process.argv[3] ?? "60");
if (!Number.isInteger(days) || days < 5 || days > 500) throw new Error("조회 거래일은 5~500 사이 정수여야 합니다.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 설정되지 않았습니다.");
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
await client.connect();
try {
  await client.query("SET default_transaction_read_only = on");
  const usUniverse = await client.query("SELECT market,code FROM us_common_stock_universe WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK' ORDER BY market,code");
  const usCached = await client.query(`SELECT market,code,candle_date,trading_value,fetched_at FROM us_instrument_universe_candles WHERE timeframe='D' AND candle_date=(SELECT max(candle_date) FROM us_instrument_universe_candles WHERE timeframe='D') ORDER BY market,code`);
  const { getAccessToken } = await import("../lib/kis-token.ts");
  const token = await getAccessToken();
  if (!token || !process.env.KIS_APPKEY || !process.env.KIS_APPSECRET) throw new Error("KIS 인증을 사용할 수 없습니다.");

  const krCheckpoint = resolve(process.cwd(), "scratch/market-daily-turnover-kr-index.json");
  const usCheckpoint = resolve(process.cwd(), "scratch/market-daily-turnover-us.jsonl");
  await mkdir(resolve(process.cwd(), "scratch"), { recursive: true });
  const dateStart = new Date(Date.now() - 150 * 86400000).toISOString().slice(0, 10).replaceAll("-", "");
  const dateEnd = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const krIndexBars = new Map();
  for (const line of (await readFile(krCheckpoint, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean)) { const row=JSON.parse(line); krIndexBars.set(`${row.date}:${row.code}`,row); }
  for (const [index, [code, marketClass]] of [["0001", "K"], ["1001", "Q"]].entries()) {
    const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice");
    for (const [key, value] of Object.entries({ FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: dateStart, FID_INPUT_DATE_2: dateEnd, FID_PERIOD_DIV_CODE: "D", FID_COND_SCR_DIV_CODE: "20214", FID_MRKT_CLS_CODE: marketClass, FID_BLNG_CLS_CODE: "0" })) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { "content-type": "application/json; charset=utf-8", Authorization: `Bearer ${token}`, appkey: process.env.KIS_APPKEY, appsecret: process.env.KIS_APPSECRET, tr_id: "FHKUP03500100", custtype: "P" }, signal: AbortSignal.timeout(30000) });
    const data = await response.json(); if (!response.ok || data.rt_cd !== "0") throw new Error(`국내 KIS 지수 일봉 실패 ${code}: ${data.msg_cd ?? ""} ${data.msg1 ?? ""}`);
    if (!Array.isArray(data.output2) || data.output2.length === 0) throw new Error(`국내 KIS 지수 일봉 데이터가 비었습니다: ${code}`);
    for (const bar of data.output2) {
      if (!/^\d{8}$/.test(String(bar.stck_bsop_date)) || !/^\d+$/.test(String(bar.acml_tr_pbmn ?? ""))) continue;
      const row = { date: bar.stck_bsop_date, turnover: String(BigInt(bar.acml_tr_pbmn) * 1000000n), fetchedAt: new Date().toISOString(), code };
      krIndexBars.set(`${row.date}:${row.code}`,row);
    }
    console.log(JSON.stringify({ event: "progress", market: "KR", index: code, count: data.output2.length, completed: index + 1, total: 2 }));
  }
  await writeFile(krCheckpoint,[...krIndexBars.values()].map(row=>JSON.stringify(row)).join("\n")+"\n","utf8");
  const krDaily = new Map();
  for(const row of krIndexBars.values()){const day=krDaily.get(row.date)??{date:row.date,turnover:0n,reported:0,stocks:0,updatedAt:row.fetchedAt};day.turnover+=BigInt(row.turnover);day.reported++;day.stocks++;if(row.fetchedAt>day.updatedAt)day.updatedAt=row.fetchedAt;krDaily.set(row.date,day)}

  const existing = new Map();
  for (const line of (await readFile(usCheckpoint, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean)) { const row = JSON.parse(line); existing.set(`${row.market}:${row.code}`, row); }
  const latestUsDate = dateEnd;
  let lastRequestAt = 0;
  for (const [index, stock] of usUniverse.rows.entries()) {
    const key = `${stock.market}:${stock.code}`;
    const url = new URL("https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/dailyprice");
    for (const [k, v] of Object.entries({ AUTH: "", EXCD: stock.market, SYMB: stock.code, GUBN: "0", BYMD: latestUsDate, MODP: "1" })) url.searchParams.set(k, v);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, lastRequestAt + 125 - Date.now()))); lastRequestAt = Date.now();
    let data; let responseStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await fetch(url, { headers: { "content-type": "application/json; charset=utf-8", Authorization: `Bearer ${token}`, appkey: process.env.KIS_APPKEY, appsecret: process.env.KIS_APPSECRET, tr_id: "HHDFS76240000", custtype: "P" }, signal: AbortSignal.timeout(20000) });
        responseStatus = response.status; data = await response.json();
        if (response.ok && data.rt_cd === "0") break;
        if (!/EGW00201|초당 거래건수|호출 제한/i.test(`${data.msg_cd ?? ""} ${data.msg1 ?? ""}`) && ![429, 500, 502, 503, 504].includes(response.status)) break;
        data = null;
      } catch { data = null; }
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1500 * (attempt + 1))));
    }
    const raw = data?.output ?? data?.output2 ?? [];
    const fetchedAt = new Date().toISOString();
    const bars = raw.filter(bar => /^\d{8}$/.test(String(bar.xymd ?? "")) && /^\d+(?:\.\d+)?$/.test(String(bar.tamt ?? ""))).map(bar => ({ date: String(bar.xymd), turnover: String(bar.tamt) }));
    const previous = existing.get(key);
    const mergedBars = new Map((previous?.bars ?? []).map(bar => [bar.date,bar]));
    for(const bar of bars) mergedBars.set(bar.date,bar);
    const row = { market: stock.market, code: stock.code, bars:[...mergedBars.values()].sort((a,b)=>a.date.localeCompare(b.date)), status: responseStatus, fetchedAt };
    await appendFile(usCheckpoint, JSON.stringify(row) + "\n", "utf8"); existing.set(key, row);
    if ((index + 1) % 100 === 0 || index + 1 === usUniverse.rows.length) console.log(JSON.stringify({ event: "progress", market: "US", completed: index + 1, total: usUniverse.rows.length, amountReported: [...existing.values()].filter(item => item.bars.length).length }));
  }
  const krRows = [...krDaily.values()].sort((a,b) => a.date.localeCompare(b.date)).slice(-days).map(row => ({ ...row, turnover: row.turnover.toString(), currency: "KRW" }));
  const usDaily = new Map();
  for (const row of existing.values()) for (const bar of row.bars) { const day=usDaily.get(bar.date)??{date:bar.date,turnover:0,reported:0,stocks:0,updatedAt:row.fetchedAt};day.turnover+=Number(bar.turnover);day.reported++;day.stocks++;if(row.fetchedAt>day.updatedAt)day.updatedAt=row.fetchedAt;usDaily.set(bar.date,day); }
  const usRows = [...usDaily.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-days).map(row=>({...row,turnover:String(row.turnover),currency:"USD"}));
  const usReported = [...existing.values()].filter(row=>row.bars.length).length;
  const metadata = { generatedAt: new Date().toISOString(), requestedTradingDays: days, provenance: "LOCAL_WORKSPACE_DATABASE; NOT_PRODUCTION", sources: { KR: "KIS domestic index daily chart FHKUP03500100, index 0001 KOSPI + 1001 KOSDAQ; acml_tr_pbmn (unit conversion factor assumed: 1,000,000 KRW per response unit; official unit not verified)", US: "KIS overseas daily price HHDFS76240000, NAS/NYS/AMS common stocks, output.tamt" }, coverage: { KR: { reported: krRows.at(-1)?.reported ?? 0, stocks: 2, latest_date: krRows.at(-1)?.date ?? null, updated_at: new Date().toISOString() }, US: { stocks: usUniverse.rows.length, cached: usCached.rows.length, reported: usReported, latest_date: usRows.at(-1)?.date ?? null, updated_at: new Date().toISOString() } }, currencies: { KR: "KRW", US: "USD" }, complete: { KR: krRows.length > 0, US: usReported === usUniverse.rows.length && usRows.length > 0 } };
  const payload = JSON.stringify({ metadata, series: { KR: krRows, US: usRows } }).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>국내·미국 일별 거래대금 추이</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e6edf7;font:15px/1.55 system-ui,"Malgun Gothic",sans-serif}.wrap{max-width:1180px;margin:auto;padding:28px 20px 60px}header{padding:26px 28px;border:1px solid #24314a;border-radius:20px;background:linear-gradient(130deg,#17243b,#10192b)}h1{margin:0 0 8px;font-size:clamp(23px,4vw,36px)}p{color:#a9bad2;margin:4px 0}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.card,section{border:1px solid #24314a;border-radius:16px;background:#111b2c;padding:18px}.card strong{display:block;font-size:22px;margin-top:6px}.muted{font-size:13px;color:#91a3bd}.controls{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:18px 0}label{display:flex;gap:8px;align-items:center}select{background:#18263b;color:#e6edf7;border:1px solid #3b4d69;border-radius:8px;padding:8px}svg{width:100%;height:auto;min-height:300px}.grid{stroke:#26354c;stroke-width:1}.line{fill:none;stroke-width:2.5}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}th,td{text-align:right;padding:9px;border-bottom:1px solid #29374d}th:first-child,td:first-child{text-align:left}.table{overflow:auto}.note{font-size:13px;color:#a9bad2}footer{margin-top:18px;color:#91a3bd;font-size:12px}@media(max-width:680px){.wrap{padding:15px 12px 40px}.cards{grid-template-columns:1fr}section{padding:12px}table{min-width:600px}}
</style></head><body><main class="wrap"><header><h1>국내·미국 일별 거래대금 추이</h1><p id="period"></p><p><strong>로컬 DB 자료 · 운영 서버 데이터가 아닙니다.</strong> KIS 거래대금 필드 합계이며 시장별 통화를 분리 표시합니다.</p></header><div class="cards" id="cards"></div><section><div class="controls"><label for="market">시장<select id="market"><option value="KR">국내 · KRW</option><option value="US">미국 · USD</option></select></label><label for="range">표시 기간<select id="range"><option value="20">최근 20거래일</option><option value="60" selected>최근 60거래일</option><option value="120">최근 120거래일</option><option value="all">전체</option></select></label></div><svg id="chart" viewBox="0 0 1000 390" role="img" aria-label="일별 시장 거래대금 추이"></svg><div class="table" id="table"></div></section><section style="margin-top:16px"><h2>원천과 커버리지</h2><p class="note" id="source"></p><div class="table" id="coverage"></div></section><footer>정적 파일 생성: ${metadata.generatedAt}. 데이터가 없는 날짜는 보간하거나 0으로 추정하지 않습니다.</footer></main><script type="application/json" id="data">${payload}</script><script>
const D=JSON.parse(document.getElementById('data').textContent),colors={KR:'#65d6ad',US:'#74a7ff'},fmt=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}),date=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8),money=(v,c)=>v==null?'미확인':(c==='KRW'?'₩':'$')+fmt.format(Number(v)/(c==='KRW'?1e12:1e9))+(c==='KRW'?'조':'B'),sel=document.getElementById('market'),range=document.getElementById('range');function render(){const m=sel.value,c=D.metadata.currencies[m],all=D.series[m],n=range.value==='all'?all.length:Number(range.value),rows=all.slice(-n),cov=D.metadata.coverage[m];document.getElementById('period').textContent=rows.length?date(rows[0].date)+' ~ '+date(rows.at(-1).date)+' · '+rows.length+' 거래일':'데이터 없음';document.getElementById('cards').innerHTML=['최신일 거래대금|'+(rows.length?money(rows.at(-1).turnover,c):'미확인'),'종목·지수 커버리지|'+(m==='KR'?'KOSPI + KOSDAQ':fmt.format(cov.reported)+' / '+fmt.format(cov.stocks)+' 보통주')].map(x=>{const[a,b]=x.split('|');return '<div class="card"><span class="muted">'+a+'</span><strong>'+b+'</strong></div>'}).join('');const svg=document.getElementById('chart');if(!rows.length)svg.innerHTML='<text x="500" y="190" text-anchor="middle" fill="#a9bad2">추이 데이터를 확인할 수 없습니다.</text>';else{const W=1000,H=390,L=95,R=18,T=20,B=45,max=Math.max(...rows.map(r=>Number(r.turnover))),step=(W-L-R)/Math.max(1,rows.length-1);let s='';for(let i=0;i<5;i++){const y=T+(H-T-B)*i/4;s+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" fill="#91a3bd" font-size="12">'+money(max*(1-i/4),c)+'</text>'}s+='<polyline class="line" stroke="'+colors[m]+'" points="'+rows.map((r,i)=>(L+i*step)+','+(H-B-Number(r.turnover)/max*(H-T-B))).join(' ')+'"/>';[0,Math.floor((rows.length-1)/2),rows.length-1].forEach(i=>s+='<text x="'+(L+i*step)+'" y="'+(H-10)+'" text-anchor="middle" fill="#91a3bd" font-size="12">'+date(rows[i].date)+'</text>');svg.innerHTML=s}document.getElementById('table').innerHTML='<table><thead><tr><th>거래일</th><th>거래대금 ('+(c==='KRW'?'KRW':'USD')+')</th><th>보고 수</th><th>갱신 시각 (UTC)</th></tr></thead><tbody>'+[...rows].reverse().map(r=>'<tr><td>'+date(r.date)+'</td><td>'+money(r.turnover,c)+'</td><td>'+fmt.format(r.reported)+'</td><td>'+r.updatedAt+'</td></tr>').join('')+'</tbody></table>';document.getElementById('source').textContent=D.metadata.sources[m]+' · 최신일 커버리지 '+fmt.format(cov.reported)+'/'+fmt.format(cov.stocks)+' · 생성 '+D.metadata.generatedAt;document.getElementById('coverage').innerHTML='<table><tbody><tr><th>대상 활성 보통주/지수</th><td>'+fmt.format(cov.stocks)+'</td><th>응답 커버리지</th><td>'+fmt.format(cov.reported)+'</td></tr><tr><th>최신 거래일</th><td>'+date(cov.latest_date||'00000000')+'</td><th>상태</th><td>'+((m==='KR'||D.metadata.complete.US)?'완료':'불완전')+'</td></tr></tbody></table>'}sel.addEventListener('change',render);range.addEventListener('change',render);render();</script></body></html>`;
  await writeFile(outputPath, html, "utf8");
  console.log(JSON.stringify({ output: outputPath, metadata, series: { KR: { days: krRows.length, first: krRows[0]?.date, last: krRows.at(-1)?.date }, US: { days: usRows.length, first: usRows[0]?.date, last: usRows.at(-1)?.date } } }, null, 2));
} finally { await client.end(); }
