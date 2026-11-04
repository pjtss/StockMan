import fs from 'node:fs';

const temp = process.env.TEMP;
const readTemp = (name) => JSON.parse(fs.readFileSync(`${temp}/${name}`, 'utf8'));
const batch = process.argv[2];
if (!/^\d{8}-b\d{2}$/.test(batch || '')) throw new Error('Usage: node scripts/generate-us-smallcap-event-batch.mjs YYYYMMDD-bNN');
const batchIndex = process.env.SMALLCAP_BATCH_INDEX;
if (!batchIndex) throw new Error('Set SMALLCAP_BATCH_INDEX to the operating collection prefix, e.g. batch6');
const selection = readTemp(`smallcap-${batchIndex}-final-selection.json`);
const intel = readTemp(`smallcap-${batchIndex}-production-intelligence.json`);
const submissions = readTemp(`smallcap-${batchIndex}-sec-submissions.json`);
const priorBatch = process.env.SMALLCAP_PRIOR_BATCH;
if (!priorBatch) throw new Error('Set SMALLCAP_PRIOR_BATCH to the prior review suffix, e.g. 20261104-b05');
const prior = JSON.parse(fs.readFileSync(`data/us-smallcap-event-review-${priorBatch}.json`, 'utf8'));
const ledgerPrior = JSON.parse(fs.readFileSync(`data/us-smallcap-filing-review-ledger-${priorBatch}.json`, 'utf8'));
const canonical = JSON.parse(fs.readFileSync('data/market-impact-events.json', 'utf8'));
const batchTag = `batch_${batch.replace(/-/g, '_')}`;
const ids = (accession, suffix) => `SEC:${accession}:${suffix}`;
const eventDefsPath = process.env.SMALLCAP_BATCH_EVENT_DEFS;
if (!eventDefsPath) throw new Error('Set SMALLCAP_BATCH_EVENT_DEFS to the reviewed event definitions JSON');
const eventDefs = JSON.parse(fs.readFileSync(eventDefsPath, 'utf8'));

const priorTickers = new Set(prior.universe.issuers.map(x => x.ticker));
const selected = selection.selected;
if (selected.length !== 100 || selected.some(x => priorTickers.has(x.ticker))) throw new Error('Batch universe invalid');
const intelByTicker = new Map(intel.items.map(x => [x.ticker, x]));
const subByTicker = new Map(submissions.items.map(x => [x.ticker, x]));
const issuerRows = selected.map(x => {
  const sub = subByTicker.get(x.ticker), live = intelByTicker.get(x.ticker);
  if (!sub || !live || sub.status !== 'OK' || !live.ok || sub.cik !== x.cik) throw new Error(`Missing operating/SEC confirmation ${x.ticker}`);
  const instrument = x.officialMaster?.instrument;
  if (!instrument || instrument.instrument_type !== 'COMMON_STOCK' || instrument.enabled !== true) throw new Error(`No active common stock master ${x.ticker}`);
  const filings = sub.filings.filter(f => f.filingDate >= '2025-11-04' && f.filingDate < '2026-11-05').map(f => ({...f, reviewStatus:'INVENTORY_ONLY',reviewBatch:batchTag,eventIds:[],relatedFilings:[]}));
  return {ticker:x.ticker,cik:x.cik,secCompanyName:x.secCompanyName,market:x.market,officialMaster:{checkedAt:selection.asOf,instrument},marketCap:{usd:x.marketCap,currency:x.currency,source:'KIS_OVERSEAS_PRICE',observedAt:x.observedAt,fetchedAt:x.fetchedAt,freshness:x.freshness},reviewWindow:{filingDateFromInclusive:'2025-11-04',filingDateToExclusive:'2026-11-05',calendarDays:366},secSubmissions:{sourceUrl:`https://data.sec.gov/submissions/CIK${x.cik}.json`,fetchedAt:submissions.collectedAt,filings},operatingServerLatestCheck:{checkedAt:'2026-11-03',httpStatus:200,asOf:intel.asOf,instrument:{market:x.market,code:x.ticker,instrumentType:'COMMON_STOCK',enabled:true},marketCap:{usd:x.marketCap,currency:x.currency,observedAt:x.observedAt,freshness:x.freshness},databaseWrite:false},secCompanyMaster:{checkedAt:selection.asOf,cik:x.secCik,companyName:x.secCompanyName,exchange:x.secExchange,sourceUrl:'https://www.sec.gov/files/company_tickers_exchange.json'},rssArticles:live.rssArticles||[],bullishArticles:live.bullishArticles||[],secEvents:live.secEvents||[],eventReviewStatus:'INVENTORY_ONLY',reviewedEventIds:[],reviewedPrimarySourceUrls:[],sourceLinkedEventIds:[],eventSourceUrls:[]};
});
const evs=[];
for (const [ticker, accession, suffix, date, status, title, summary, type] of eventDefs) {
  const issuer=issuerRows.find(x=>x.ticker===ticker), filing=issuer?.secSubmissions.filings.find(f=>f.accession===accession);
  if (!filing) throw new Error(`Event accession not found in issuer inventory ${ticker}/${accession}`);
  const sourceUrl=filing.url;
  const canonicalEvent={ticker,eventId:ids(accession,suffix),companyName:issuer.secCompanyName,eventDate:date,eventType:type,status,direction:'UNCERTAIN',impactHorizon:'UNKNOWN',title,summary,rationale:'일정·공시 사실 자체는 주가 방향을 보장하지 않는다. 기업별 유동성, 자금조달 및 상장유지 위험을 함께 고려한다.',risks:['소형주 유동성 및 변동성 위험','이벤트 결과와 가격 방향은 보장되지 않음'],limitations:['공개 SEC 제출자료와 대상 원문 범위에 한정','시가총액 관측치는 2026-11-02 시점으로 stale'],sourceType:'SEC_FILING',sourceId:accession,sourceUrl,evidence:[{quote:summary,locator:`SEC ${filing.form} filed ${filing.filingDate}; issuer event disclosure`,sourceUrl}],confidence:'MEDIUM',impactHorizonBasis:'정량 주가 반응 표본 검증을 수행하지 않아 미분류'};
  const row={ticker,status,eventDate:date,eventId:canonicalEvent.eventId,sourceIds:[accession],primarySourceUrls:[sourceUrl],sourceReviewStatus:'TARGETED_SECTION_REVIEW',revalidatedAt:'2026-11-03T18:05:08Z',validationNotes:[summary]};
  evs.push({canonicalEvent,row,ticker,accession});
  filing.reviewStatus='TARGETED_SECTION_REVIEW'; filing.eventIds.push(canonicalEvent.eventId);
  issuer.eventReviewStatus='TARGETED_SECTION_REVIEW'; issuer.reviewedEventIds.push(canonicalEvent.eventId); issuer.reviewedPrimarySourceUrls.push(sourceUrl); issuer.sourceLinkedEventIds.push(canonicalEvent.eventId); issuer.eventSourceUrls.push(sourceUrl);
}
for(const i of issuerRows) if(!i.reviewedEventIds.length)i.eventReviewStatus='INVENTORY_ONLY';
const filingCounts={}; for(const i of issuerRows)for(const f of i.secSubmissions.filings)filingCounts[f.reviewStatus]=(filingCounts[f.reviewStatus]||0)+1;
const review={schemaVersion:'us-smallcap-event-review.v1',batchId:batch,generatedAt:'2026-11-03T18:05:08Z',operatingServer:{baseUrl:'https://stockman.r-e.kr',readOnly:true,checkedAt:intel.asOf},criteria:{market:'US',instrumentType:'COMMON_STOCK',marketCap:{currency:'USD',minExclusive:0,maxInclusive:100000000},adrAdsDepositaryExcluded:true,issuerCount:100},reviewWindow:{batchId:batch,filingDateFromInclusive:'2025-11-04',filingDateToExclusive:'2026-11-05',calendarDays:366},sourceMethodology:{candidateUniverse:'Operating-server public candidate API; prior 300 excluded; operating metadata revalidation; SEC official company ticker master CIK match',officialMaster:'/api/public/us-stock-metadata',marketCapSnapshot:'KIS_OVERSEAS_PRICE',snapshotFreshness:'STALE',productionIntelligenceEndpoint:'/api/public/market-intelligence',secSubmissionsSource:'SEC data.sec.gov submissions and official SEC company_tickers_exchange.json',readOnly:true},universe:{issuerCount:100,issuers:issuerRows},reviewedEvents:evs.map(x=>x.row),reviewStatus:{eventCount:evs.length,eventRecordCount:evs.length,issuerCountWithEventRecords:new Set(evs.map(x=>x.ticker)).size,issuersWithoutEventRecords:100-new Set(evs.map(x=>x.ticker)).size,eventSourceReviewedIssuerCount:new Set(evs.map(x=>x.ticker)).size,targetedSectionReviewIssuerCount:new Set(evs.map(x=>x.ticker)).size,primarySourceReviewedIssuerCount:0,recoveredEventRevalidationPendingCount:0,recoveredEventRevalidationPendingIssuerCount:0,filingReviewStatusCounts:filingCounts,filingCountsByStatus:filingCounts,filingCountsByForm:submissions.summary.forms,latestProductionChecksAsOf:intel.asOf,filingAmendmentRelationCount:0}};
const ledgerIssuers=issuerRows.map(i=>({ticker:i.ticker,cik:i.cik,secCompanyMaster:i.secCompanyMaster,reviewWindow:i.reviewWindow,submissionCount:i.secSubmissions.filings.length,filings:i.secSubmissions.filings}));
const links=evs.map(x=>({ticker:x.ticker,accession:x.accession,eventId:x.row.eventId}));
const ledger={schemaVersion:'us-smallcap-filing-review-ledger.v1',batchId:batch,generatedAt:review.generatedAt,operatingSnapshotGeneratedAt:intel.asOf,reviewWindow:review.reviewWindow,issuerCount:100,submissionCount:Object.values(filingCounts).reduce((a,b)=>a+b,0),reviewStatusDefinitions:{INVENTORY_ONLY:'SEC submission metadata collected; primary document not individually read',TARGETED_SECTION_REVIEW:'SEC primary filing/event-relevant sections inspected'},issuers:ledgerIssuers,reviewStatusCounts:filingCounts,reviewCoverageSummary:{eventRelevantDocuments:links,eventCount:evs.length,primarySourceReviewedIssuerCount:0,targetedSectionReviewIssuerCount:new Set(evs.map(x=>x.ticker)).size,eventSourceReviewedIssuerCount:new Set(evs.map(x=>x.ticker)).size,pendingRecoveredEventIssuerCount:0,filingAmendmentRelationCount:0}};
const canonicalIds=new Set(canonical.markets.US.map(e=>e.eventId));
for(const x of evs) if(!canonicalIds.has(x.canonicalEvent.eventId)){canonical.markets.US.push(x.canonicalEvent);canonicalIds.add(x.canonicalEvent.eventId);}
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n','utf8');
write('data/market-impact-events.json',canonical); write(`data/us-smallcap-event-review-${batch}.json`,review); write(`data/us-smallcap-filing-review-ledger-${batch}.json`,ledger);
console.log(JSON.stringify({tickers:100,filings:ledger.submissionCount,events:evs.length,rss:intel.items.reduce((a,x)=>a+(x.rssArticles||[]).length,0),bullish:intel.items.reduce((a,x)=>a+(x.bullishArticles||[]).length,0)},null,2));
