import fs from 'node:fs';

const temp = process.env.TEMP;
const readTemp = (name) => JSON.parse(fs.readFileSync(`${temp}/${name}`, 'utf8'));
const selection = readTemp('smallcap-batch4-final-selection.json');
const intel = readTemp('smallcap-batch4-production-intelligence.json');
const submissions = readTemp('smallcap-batch4-sec-submissions.json');
const prior = JSON.parse(fs.readFileSync('data/us-smallcap-event-review-20261104-b03.json', 'utf8'));
const ledgerPrior = JSON.parse(fs.readFileSync('data/us-smallcap-filing-review-ledger-20261104-b03.json', 'utf8'));
const canonical = JSON.parse(fs.readFileSync('data/market-impact-events.json', 'utf8'));
const batch = '20261104-b04';
const batchTag = 'batch_20261104_b04';
const ids = (accession, suffix) => `SEC:${accession}:${suffix}`;
const eventDefs = [
  ['KUST','0001493152-26-045762','SPLIT_COMPLETED','2026-10-01','COMPLETED','1대10 역분할 효력 및 Nasdaq 조정 거래 개시','회사는 2026-10-01 효력 발생 및 거래 개시를 공지했다. 발행주식 6,506,860주에서 650,686주로 감소(회사 공시 수치). 역분할의 기계적 가격 조정은 투자수익률과 다르다.','REVERSE_SPLIT'],
  ['KUST','0001493152-26-048183','AUTHORIZED_SHARES_INCREASE','2026-10-22','COMPLETED','정관상 수권주식 13,333,333주에서 12억주로 변경','정관 변경으로 수권 한도가 증가했다. 이는 실제 발행주식 또는 즉각적 희석을 뜻하지 않는다.','AUTHORIZED_SHARES'],
  ['DLXY','0001213900-26-101140','SPLIT_AND_BID_COMPLIANCE','2026-09-28','COMPLETED','1대5 역분할 및 Nasdaq $1 최소호가 회복 통지','회사는 2026-09-28 1대5 역분할과 2026-09-29 Nasdaq 최소호가 요건 회복 통지를 공시했다. split 기계조정과 실제 수익률은 구분한다.','REVERSE_SPLIT'],
  ['GAUZ','0001213900-26-105914','SPLIT_COMPLETED','2026-09-11','COMPLETED','1대20 역분할 조정 거래 개시','효력은 2026-09-10 11:59 p.m. ET, 조정 거래는 09-11 개시. 발행·유통주식 합계 공시치 22,862,718주에서 1,143,135주.','REVERSE_SPLIT'],
  ['GAUZ','0001213900-26-101847','NASDAQ_DELISTING_APPEAL','2026-09-15','REPORTED','Nasdaq 상장폐지 결정 및 회사의 구두심리 항소 계획','Nasdaq 결정은 보고됐고 회사는 항소 계획을 밝혔다. 항소 기간 중 정지·상장폐지 유예가 적용된다고 공시했으며 최종 결과는 미확정.','LISTING_RISK'],
  ['CYN','0001213900-26-109853','BID_PRICE_DEADLINE','2027-04-12','CONFIRMED_SCHEDULED','Nasdaq $1 최소호가 회복 기한','회사가 공시한 회복 기한은 2027-04-12이며 10영업일 연속 $1 이상 종가 조건이다. 달성 여부는 미확정.','LISTING_RISK'],
  ['CYN','0001213900-26-114511','BOARD_REMEDIATION_DEADLINE','2027-11-03','CONFIRMED_SCHEDULED','Nasdaq 이사회 독립성 개선 기한','개선 기한은 다음 정기주총일과 2027-11-03 중 빠른 날이다.','LISTING_RISK'],
  ['ARAI','0001493152-26-049616','REVERSE_SPLIT_AUTHORITY','2026-11-02','REPORTED','재편 조건부 1대10~1대65 역분할 권한','정관 개정으로 권한을 승인했으나 redomestication 조건과 이사회 결정이 남아 실제 비율·효력일은 정해지지 않았다.','REVERSE_SPLIT_PLAN'],
  ['ARAI','0001493152-26-027491','BID_PRICE_DEADLINE','2026-11-30','CONFIRMED_SCHEDULED','Nasdaq $1 최소호가 회복 기한','180일 회복기간이 2026-11-30 종료하며 $1 이상 10영업일 연속 종가 요건을 공시했다.','LISTING_RISK'],
  ['ARAI','0001493152-26-034582','MVPS_DEADLINE','2027-01-19','CONFIRMED_SCHEDULED','Nasdaq 최소 시가총액 요건 회복 기한','회사 공시에 제시된 $15m MVPS 회복 기한은 2027-01-19. 달성 여부는 미확정.','LISTING_RISK'],
  ['XCUR','0001193125-26-392654','EQUITY_EXTENSION','2026-12-05','CONFIRMED_SCHEDULED','Nasdaq 주주자본 요건 연장 기간 종료일','Nasdaq이 2026-12-05까지 연장했다고 공시했다. 이후 준수 여부 또는 추가 조치는 이 자료에서 확인되지 않는다.','LISTING_RISK'],
  ['XCUR','0001193125-26-443911','SHAREHOLDER_MEETING_AND_AUTHORITY','2026-12-02','CONFIRMED_SCHEDULED','가상 임시주총 및 수권주식·20% 초과 발행 안건','2026-12-02 오후 5시 CT 주총 소집과 수권주식 2억→4억, 20% 초과 발행 관련 안건을 공시했다. 승인·발행은 확정되지 않았다.','SHAREHOLDER_MEETING'],
  ['WCT','0001213900-26-097242','SPLIT_COMPLETED','2026-09-08','COMPLETED','Class A 보통주 1대5 역분할 및 조정 거래','2026-09-08 조정 거래 개시. 발행주식 52,905,328주에서 약 10,581,066주로 공시.','REVERSE_SPLIT'],
  ['WCT','0001213900-26-033198','BID_COMPLIANCE_RECOVERED','2026-03-20','COMPLETED','Nasdaq $1 최소호가 회복 및 사안 종결','회사는 2026-03-06~19 동안 $1 이상 종가를 기록해 요건을 회복했고 Nasdaq 사안 종결을 통지했다고 공시했다.','LISTING_COMPLIANCE'],
  ['RCT','0001493152-26-047176','NASDAQ_DELISTING_APPEAL','2026-10-14','REPORTED','Nasdaq 상장폐지 결정 및 항소에 따른 유예','회사는 상장폐지 결정에 항소했고 심리 전 거래 정지/상장폐지 효력은 유예된다고 공시했다. 자기자본 부족으로 추가 최소호가 기간이 없다는 설명 포함. 최종 결과 미확정.','LISTING_RISK'],
  ['RCT','0001493152-26-049426','REVERSE_SPLIT_AUTHORITY','2026-11-02','REPORTED','주주 승인 역분할 권한 상한을 100대1로 확대','주주가 정관상 역분할 권한을 기존 20대1에서 최대 100대1로 변경하는 안을 승인했다. 실제 비율·이사회 실행일은 정해지지 않았다.','REVERSE_SPLIT_PLAN'],
  ['EVGN','0001178913-26-004654','BID_PRICE_EXTENSION','2027-03-29','CONFIRMED_SCHEDULED','Nasdaq 최소호가 추가 180일 기간 종료','회사는 추가 회복 기간이 2027-03-29까지라고 공시했다. 준수 달성은 미확정.','LISTING_RISK'],
  ['EVGN','0001178913-26-004722','SPECIAL_MEETING','2026-11-10','CONFIRMED_SCHEDULED','주주 특별회의 및 협력계약 관련 안건','2026-11-10 이스라엘 현지 오후 1시 회의로 공지됐다. 제안 내용의 승인 결과는 미확정.','SHAREHOLDER_MEETING'],
  ['INM','0001213900-26-101492','EQUITY_DEFICIENCY_PLAN','2026-11-02','REPORTED','Nasdaq 주주자본 부족 통지 및 개선계획 제출','회사는 자본 $1,075,007, 기준 $2.5m을 공시했다. 계획 제출기한은 11-02이며 수락 시 최대 180일 개선 기간 가능하나 수락은 확인되지 않았다.','LISTING_RISK'],
  ['INM','0001193125-26-436382','CVR_RECORD_DATE','2026-11-05','CONFIRMED_SCHEDULED','합병 조건부 CVR 기준일','CVR 기준일은 2026-11-05로 공시됐다. CVR 발행은 합병 종결 조건이며 종결일은 확정되지 않았다.','CORPORATE_ACTION'],
  ['PBK','0001493152-26-049458','SHAREHOLDER_SPLIT_AUTHORITY','2026-10-29','REPORTED','주주가 1대10~1대30 주식 병합 권한 승인','주주가 2027-10-29 이전 이사회가 결정할 병합 권한을 승인했으며 실제 시행·비율은 정하지 않았다.','REVERSE_SPLIT_PLAN'],
  ['TCRT','0001193125-26-427890','ACQUISITION_COMPLETED','2026-10-13','COMPLETED','Velaris 인수 종결 및 관련 자금조달','회사는 2026-10-13 인수 종결을 공시했다. 계약·자금조달 세부와 향후 사업 기여는 원문 범위 내에서만 확인 가능하며 성과는 미확정.','ACQUISITION'],
  ['TCRT','0001193125-26-397996','REGISTERED_DIRECT_OFFERING_CLOSED','2026-09-21','COMPLETED','등록 직접공모 종결 및 순유입 $915,400.50','회사가 공시한 순 proceeds는 $915,400.50. 자금 유입과 기존 주주 희석 위험을 함께 고려해야 한다.','FINANCING'],
  ['MGRX','0001493152-26-046510','OFFERING_REPORTED','2026-10-09','REPORTED','보통주 657,000주와 warrant 657,000개 공모','주당 결합가격 $0.75, 총액 $492,750, 예상 종결일 10-09를 최초 공시했다. 본 자료에서 별도 종결 확인 공시는 찾지 못해 종결 상태는 보고로 유지.','FINANCING'],
];

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
