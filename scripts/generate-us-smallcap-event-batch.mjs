import fs from 'node:fs';

const temp = process.env.TEMP || process.env.TMPDIR || process.env.TMP;
if (!temp) throw new Error('Set TEMP to the directory containing the batch review source files');
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
const priorReviewPath = `data/us-smallcap-event-review-${priorBatch}.json`;
const priorLedgerPath = `data/us-smallcap-filing-review-ledger-${priorBatch}.json`;
if (!fs.existsSync(priorReviewPath) || !fs.existsSync(priorLedgerPath)) throw new Error(`Prior review/ledger required for batch uniqueness check: ${priorBatch}`);
const prior = JSON.parse(fs.readFileSync(priorReviewPath, 'utf8'));
const ledgerPrior = JSON.parse(fs.readFileSync(priorLedgerPath, 'utf8'));
const persistedBatchTickers = new Map();
for (const filename of fs.readdirSync('data')) {
  const match = filename.match(/^us-smallcap-event-review-(\d{8}(?:-b\d{2})?)\.json$/);
  if (!match || filename === `us-smallcap-event-review-${batch}.json`) continue;
  const priorReview = JSON.parse(fs.readFileSync(`data/${filename}`, 'utf8'));
  for (const issuer of priorReview.universe?.issuers || []) {
    const batches = persistedBatchTickers.get(issuer.ticker) || [];
    batches.push(match[1]);
    persistedBatchTickers.set(issuer.ticker, batches);
  }
}
const canonical = JSON.parse(fs.readFileSync('data/market-impact-events.json', 'utf8'));
const previousReviewPath = `data/us-smallcap-event-review-${batch}.json`;
const previousBatchEventIds = fs.existsSync(previousReviewPath)
  ? new Set((JSON.parse(fs.readFileSync(previousReviewPath, 'utf8')).reviewedEvents || []).map((row) => row.eventId))
  : new Set();
canonical.markets.US = canonical.markets.US.filter((event) => !previousBatchEventIds.has(event.eventId));
const batchTag = `batch_${batch.replace(/-/g, '_')}`;
const ids = (accession, suffix) => `SEC:${accession}:${suffix}`;
const eventDefsPath = process.env.SMALLCAP_BATCH_EVENT_DEFS;
if (!eventDefsPath) throw new Error('Set SMALLCAP_BATCH_EVENT_DEFS to the reviewed event definitions JSON');
const eventDefs = JSON.parse(fs.readFileSync(eventDefsPath, 'utf8'));
if (!Array.isArray(eventDefs)) throw new Error('Event definitions must be a JSON array');
const selectedTickers = new Set(selection.selected.map((issuer) => issuer.ticker));
for (const definition of eventDefs) {
  const [ticker, accession, suffix, date, status, title, summary, type, , source] = definition;
  const isExplicitExclusion = source?.explicitExclusion || source?.sourceType === 'SEC_EXPLICIT_EXCLUSION';
  const isCompanyIr = source?.sourceType === 'COMPANY_IR';
  if (!selectedTickers.has(ticker) || (!accession && !isCompanyIr) || !suffix || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !status || !title || !summary || !type) {
    throw new Error(`Malformed event decision row: ${JSON.stringify({ ticker, accession, suffix, date, type })}`);
  }
  if (isExplicitExclusion && (!source.exclusionReason || source.exclusionReason.includes('검토 대상으로 보류'))) {
    throw new Error(`Explicit SEC exclusion requires a resolved reason: ${ticker}/${accession}`);
  }
}
const reviewedAccessionSet = new Set(eventDefs.filter(([ticker, accession, , , , , , , , source]) =>
  selectedTickers.has(ticker) && accession && (!source?.sourceType || source.sourceType === 'SEC_FILING') && !source?.explicitExclusion && source?.sourceType !== 'SEC_EXPLICIT_EXCLUSION')
  .map(([ticker, accession]) => `${ticker}|${accession}`));
const excludedRelevantFilings = new Set(eventDefs.filter((definition) => definition[9]?.explicitExclusion || definition[9]?.sourceType === 'SEC_EXPLICIT_EXCLUSION')
  .map((definition) => `${definition[0]}|${definition[1]}`));
const primaryScan = readTemp(`us-smallcap-${batchIndex}-sec-primary-scan.json`);
const failedScanCount = Array.isArray(primaryScan.failed) ? primaryScan.failed.length : Number(primaryScan.failed || 0);
if (!Number.isInteger(primaryScan.requested) || !Number.isInteger(primaryScan.succeeded) || failedScanCount !== 0 || primaryScan.succeeded !== primaryScan.requested) throw new Error(`SEC primary-document scan is incomplete; requested=${primaryScan.requested}, succeeded=${primaryScan.succeeded}, failures=${failedScanCount}`);
const dateCandidateSummaryPath = `future-date-summary-${batchIndex}.json`;
const dateCandidateSummary = readTemp(dateCandidateSummaryPath);
const dateCandidateRows = dateCandidateSummary.items.filter((item) => selectedTickers.has(item.ticker));
const missingRelevantFilings = dateCandidateRows.filter((candidate) => !reviewedAccessionSet.has(candidate.ticker + '|' + candidate.accession) && !excludedRelevantFilings.has(candidate.ticker + '|' + candidate.accession));
if (missingRelevantFilings.length) throw new Error('Future-date candidates lack explicit event/exclusion decisions: ' + missingRelevantFilings.map((item) => item.ticker + '/' + item.accession).slice(0, 12).join(', '));
for (const candidate of dateCandidateRows) {
  const definition = eventDefs.find((row) => row[0] === candidate.ticker && row[1] === candidate.accession);
  if (definition?.[9]?.explicitExclusion && definition[7] === 'SEC_REVIEW_EXCLUSION' && !definition[9].exclusionReason?.includes('검토 대상으로 보류')) {
    throw new Error(`SEC date candidate exclusion is not manually resolved: ${candidate.ticker}/${candidate.accession}`);
  }
}
const incomingNonSecIdentity = new Map(eventDefs
  .filter((definition) => definition[9]?.sourceType && definition[9].sourceType !== 'SEC_FILING')
  .map(([ticker, accession, suffix, , , , , type, , source]) => [
    [ticker, source.sourceType, source.sourceId, type].join('|'),
    `IR:${ticker}:${suffix}`,
  ]));
canonical.markets.US = canonical.markets.US.filter((event) => {
  const identity = [event.ticker, event.sourceType, event.sourceId, event.eventType].join('|');
  const expectedEventId = incomingNonSecIdentity.get(identity);
  return !expectedEventId || event.eventId === expectedEventId;
});

const selected = selection.selected;
const duplicateBatchTickers = selected.filter((issuer) => persistedBatchTickers.has(issuer.ticker));
if (selected.length !== 100 || duplicateBatchTickers.length || new Set(selected.map(x => x.ticker)).size !== selected.length) {
  throw new Error(`Batch universe invalid; duplicate tickers across persisted reviews: ${duplicateBatchTickers.map(x => `${x.ticker}(${persistedBatchTickers.get(x.ticker).join(',')})`).join(', ') || 'none'}`);
}
const intelByTicker = new Map(intel.items.map(x => [x.ticker, x]));
const subByTicker = new Map(submissions.items.map(x => [x.ticker, x]));
const issuerRows = selected.map(x => {
  const sub = subByTicker.get(x.ticker), live = intelByTicker.get(x.ticker);
  if (!sub || !live || sub.status !== 'OK' || !live.ok || sub.cik !== x.cik) throw new Error(`Missing operating/SEC confirmation ${x.ticker}`);
  const instrument = x.officialMaster?.instrument;
  if (!instrument || instrument.instrument_type !== 'COMMON_STOCK' || instrument.enabled !== true) throw new Error(`No active common stock master ${x.ticker}`);
  const filings = sub.filings.filter(f => f.filingDate >= '2025-11-04' && f.filingDate < '2026-11-05').map(f => ({...f, reviewStatus:'INVENTORY_ONLY',reviewBatch:batchTag,eventIds:[],relatedFilings:[]}));
  return {ticker:x.ticker,cik:x.cik,secCompanyName:x.secCompanyName,market:x.market,officialMaster:{checkedAt:selection.asOf,instrument},marketCap:{usd:x.marketCap,currency:x.currency,source:'KIS_OVERSEAS_PRICE',observedAt:x.observedAt,fetchedAt:x.fetchedAt,freshness:x.freshness},reviewWindow:{filingDateFromInclusive:'2025-11-04',filingDateToExclusive:'2026-11-05',calendarDays:366},secSubmissions:{sourceUrl:`https://data.sec.gov/submissions/CIK${x.cik}.json`,fetchedAt:submissions.collectedAt,filings},operatingServerLatestCheck:{checkedAt:selection.asOf,httpStatus:200,asOf:intel.asOf,instrument:{market:x.market,code:x.ticker,instrumentType:'COMMON_STOCK',enabled:true},marketCap:{usd:x.marketCap,currency:x.currency,observedAt:x.observedAt,freshness:x.freshness},databaseWrite:false},secCompanyMaster:{checkedAt:selection.asOf,cik:x.secCik,companyName:x.secCompanyName,exchange:x.secExchange,sourceUrl:'https://www.sec.gov/files/company_tickers_exchange.json'},rssArticles:live.rssArticles||[],bullishArticles:live.bullishArticles||[],secEvents:live.secEvents||[],eventReviewStatus:'INVENTORY_ONLY',reviewedEventIds:[],reviewedPrimarySourceUrls:[],sourceLinkedEventIds:[],eventSourceUrls:[]};
});
for (const issuer of issuerRows) {
  const linked = new Map(eventDefs.filter((definition) => definition[0] === issuer.ticker && definition[1] && (!definition[9]?.sourceType || definition[9]?.sourceType === 'SEC_FILING') && !definition[9]?.explicitExclusion).map((definition) => [definition[1], definition[2]]));
  for (const [accession, suffix] of linked) {
    const filing = issuer.secSubmissions.filings.find((row) => row.accession === accession);
    if (filing) { filing.reviewStatus = 'TARGETED_SECTION_REVIEW'; filing.eventIds = [...new Set([...(filing.eventIds || []), ids(accession, suffix)])]; }
  }
}
const evs=[];
for (const [ticker, accession, suffix, date, status, title, summary, type, eventRisks = [], sourceOverride = null] of eventDefs) {
  if (sourceOverride?.explicitExclusion) continue;
  const issuer=issuerRows.find(x=>x.ticker===ticker), sourceType=sourceOverride?.sourceType || 'SEC_FILING';
  const filing=sourceType==='SEC_FILING' ? issuer?.secSubmissions.filings.find(f=>f.accession===accession) : null;
  if (!issuer || (sourceType==='SEC_FILING' && !filing)) throw new Error(`Event source not found in issuer inventory ${ticker}/${accession}`);
  const sourceUrl=sourceOverride?.sourceUrl || filing?.url;
  if (!sourceUrl || !/^https:\/\//.test(sourceUrl)) throw new Error(`Event source URL is required ${ticker}/${suffix}`);
  const sourceId=sourceOverride?.sourceId || accession;
  const eventId=sourceOverride?.eventId || (filing ? ids(accession,suffix) : `IR:${ticker}:${suffix}`);
  const canonicalEvent={ticker,eventId,companyName:issuer.secCompanyName,eventDate:date,eventType:type,eventKey:`${batch}:${suffix}`,status,direction:'UNCERTAIN',impactHorizon:'UNKNOWN',title,summary,rationale:'일정·공시 사실 자체는 주가 방향을 보장하지 않는다. 기업별 유동성, 자금조달 및 상장유지 위험을 함께 고려한다.',risks:[...new Set(['소형주 유동성 및 변동성 위험','이벤트 결과와 가격 방향은 보장되지 않음',...eventRisks])],limitations:['공개 1차 자료와 검토한 원문 범위에 한정','시가총액 관측치는 2026-11-02 시점으로 stale'],sourceType,sourceId,sourceUrl,evidence:[{quote:summary,locator:filing?`SEC ${filing.form} filed ${filing.filingDate}; issuer event disclosure`:'Issuer investor-relations event announcement',sourceUrl}],confidence:'MEDIUM',impactHorizonBasis:'정량 주가 반응 표본 검증을 수행하지 않아 미분류',eventDetails:{localDate:date,localTime:sourceOverride?.localTime||null,localTimezone:sourceOverride?.timezone||null,kstDate:sourceOverride?.kstDate||null,kstTime:sourceOverride?.kstTime||null},...(sourceOverride?.localTime ? {eventLocalTime:sourceOverride.localTime,eventLocalTimezone:sourceOverride.timezone,kstDate:sourceOverride.kstDate,kstTime:sourceOverride.kstTime} : {})};
  const row={ticker,status,eventDate:date,eventId:canonicalEvent.eventId,sourceIds:filing?[accession]:[],primarySourceUrls:[sourceUrl],sourceReviewStatus:filing?'TARGETED_SECTION_REVIEW':'PRIMARY_SOURCE_REVIEWED',revalidatedAt:intel.asOf,validationNotes:[summary]};
  evs.push({canonicalEvent,row,ticker,accession:filing?accession:null});
  if (filing) { filing.reviewStatus='TARGETED_SECTION_REVIEW'; filing.eventIds.push(canonicalEvent.eventId); }
  issuer.eventReviewStatus=filing?'TARGETED_SECTION_REVIEW':'PRIMARY_SOURCE_REVIEWED'; issuer.reviewedEventIds.push(canonicalEvent.eventId); issuer.reviewedPrimarySourceUrls.push(sourceUrl); issuer.sourceLinkedEventIds.push(canonicalEvent.eventId); issuer.eventSourceUrls.push(sourceUrl);
}
for(const i of issuerRows) if(!i.reviewedEventIds.length)i.eventReviewStatus='INVENTORY_ONLY';
const eventAccessionSet = new Set(evs.filter((event) => event.accession).map((event) => event.ticker + '|' + event.accession));
for (const issuer of issuerRows) for (const filing of issuer.secSubmissions.filings) {
  if (filing.reviewStatus === 'TARGETED_SECTION_REVIEW' && !eventAccessionSet.has(issuer.ticker + '|' + filing.accession)) { filing.reviewStatus = 'INVENTORY_ONLY'; filing.eventIds = []; }
}
const filingCounts={}; for(const i of issuerRows)for(const f of i.secSubmissions.filings)filingCounts[f.reviewStatus]=(filingCounts[f.reviewStatus]||0)+1;
const directTickers=new Set(evs.filter(x=>x.row.sourceReviewStatus==='PRIMARY_SOURCE_REVIEWED').map(x=>x.ticker));
const targetedTickers=new Set(evs.filter(x=>x.row.sourceReviewStatus==='TARGETED_SECTION_REVIEW').map(x=>x.ticker));
const sourceTickers=new Set([...directTickers,...targetedTickers]);
const review={schemaVersion:'us-smallcap-event-review.v1',batchId:batch,generatedAt:selection.asOf,operatingServer:{baseUrl:'https://stockman.r-e.kr',readOnly:true,checkedAt:intel.asOf},criteria:{market:'US',instrumentType:'COMMON_STOCK',marketCap:{currency:'USD',minExclusive:0,maxInclusive:100000000},adrAdsDepositaryExcluded:true,issuerCount:100},reviewWindow:{batchId:batch,filingDateFromInclusive:'2025-11-04',filingDateToExclusive:'2026-11-05',calendarDays:366},sourceMethodology:{candidateUniverse:selection.source||'Operating public fundamentals snapshots; per-ticker operating official-master revalidation; unique SEC official ticker-exchange CIK match',candidateCounts:selection.candidateCount===undefined?undefined:{localUniverse:selection.universeRows,fundamentalsReturned:selection.fundamentalsReturned,usdMarketCapAtOrBelow100mAfterPriorExclusions:selection.candidateCount,metadataCheckedUntil100Valid:selection.candidateMetadataChecked,previousBatchTickersExcluded:selection.priorBatchTickerCount},officialMaster:'/api/public/us-stock-metadata',marketCapSnapshot:'KIS_OVERSEAS_PRICE',snapshotFreshness:'STALE',productionIntelligenceEndpoint:'/api/public/market-intelligence',secSubmissionsSource:'SEC data.sec.gov submissions and official SEC company_tickers_exchange.json',apiScheduleDetails:'local-kst-v1',readOnly:true,secRecentPrimaryScan:{from:'2026-08-01',toExclusive:'2026-11-05',requested:primaryScan.requested,succeeded:primaryScan.succeeded,keywordHitDocumentCount:primaryScan.documents.filter((document)=>selectedTickers.has(document.ticker)&&document.hits?.length).length,futureDateCandidateCount:dateCandidateRows.length,allFutureDateCandidatesHaveExplicitEventOrExclusionDecision:true}},universe:{issuerCount:100,issuers:issuerRows},reviewedEvents:evs.map(x=>x.row),reviewStatus:{eventCount:evs.length,eventRecordCount:evs.length,issuerCountWithEventRecords:new Set(evs.map(x=>x.ticker)).size,issuersWithoutEventRecords:100-new Set(evs.map(x=>x.ticker)).size,eventSourceReviewedIssuerCount:sourceTickers.size,targetedSectionReviewIssuerCount:targetedTickers.size,primarySourceReviewedIssuerCount:directTickers.size,recoveredEventRevalidationPendingCount:0,recoveredEventRevalidationPendingIssuerCount:0,filingReviewStatusCounts:filingCounts,filingCountsByStatus:filingCounts,filingCountsByForm:Object.fromEntries([...submissions.items.flatMap((item)=>item.filings).reduce((map,filing)=>map.set(filing.form,(map.get(filing.form)||0)+1),new Map())]),latestProductionChecksAsOf:intel.asOf,filingAmendmentRelationCount:0}};
for (const [ticker, accession, , , , , , , , source] of eventDefs) {
  if (!source?.explicitExclusion && source?.sourceType !== 'SEC_EXPLICIT_EXCLUSION') continue;
  const issuer = issuerRows.find((row) => row.ticker === ticker);
  const filing = issuer?.secSubmissions.filings.find((row) => row.accession === accession);
  if (filing) { filing.reviewStatus = 'EXPLICITLY_EXCLUDED'; filing.exclusionReason = source.exclusionReason; }
}
const excludedReviewByAccession = new Map(eventDefs.filter((definition) => definition[9]?.explicitExclusion)
  .map(([ticker, accession, , , , , , , , source]) => [`${ticker}|${accession}`, source.exclusionReason]));
for (const issuer of issuerRows) {
  for (const filing of issuer.secSubmissions.filings) {
    if (filing.reviewStatus === 'EXPLICITLY_EXCLUDED') {
      filing.exclusionReason = excludedReviewByAccession.get(`${issuer.ticker}|${filing.accession}`) || filing.exclusionReason;
    }
  }
}
const ledgerIssuers=issuerRows.map(i=>({ticker:i.ticker,cik:i.cik,secCompanyMaster:i.secCompanyMaster,reviewWindow:i.reviewWindow,submissionCount:i.secSubmissions.filings.length,filings:i.secSubmissions.filings}));
const links=evs.filter(x=>x.accession).map(x=>({ticker:x.ticker,accession:x.accession,eventId:x.row.eventId}));
const reviewedAccessionRelations = new Set(links.map((row) => `${row.ticker}|${row.accession}`));
for (const issuer of issuerRows) for (const filing of issuer.secSubmissions.filings) {
  if (reviewedAccessionRelations.has(`${issuer.ticker}|${filing.accession}`)) {
    filing.reviewStatus = 'TARGETED_SECTION_REVIEW';
    filing.eventIds = evs.filter((event) => event.ticker === issuer.ticker && event.accession === filing.accession).map((event) => event.row.eventId);
  } else if (filing.reviewStatus === 'TARGETED_SECTION_REVIEW') {
    filing.reviewStatus = 'INVENTORY_ONLY';
    filing.eventIds = [];
  }
}
for (const issuer of issuerRows) {
  const ledgerIssuer = ledgerIssuers.find((row) => row.ticker === issuer.ticker);
  if (ledgerIssuer) ledgerIssuer.filings = issuer.secSubmissions.filings;
}
for (const key of new Set([...Object.keys(filingCounts), ...issuerRows.flatMap((issuer) => issuer.secSubmissions.filings.map((filing) => filing.reviewStatus))])) {
  filingCounts[key] = issuerRows.reduce((sum, issuer) => sum + issuer.secSubmissions.filings.filter((filing) => filing.reviewStatus === key).length, 0);
}
const ledger={schemaVersion:'us-smallcap-filing-review-ledger.v1',batchId:batch,generatedAt:review.generatedAt,operatingSnapshotGeneratedAt:intel.asOf,reviewWindow:review.reviewWindow,issuerCount:100,submissionCount:Object.values(filingCounts).reduce((a,b)=>a+b,0),reviewStatusDefinitions:{INVENTORY_ONLY:'SEC submission metadata collected; primary document not individually read',TARGETED_SECTION_REVIEW:'SEC primary filing/event-relevant sections inspected',EXPLICITLY_EXCLUDED:'Future-date candidate manually reviewed and excluded as a standalone event; exclusionReason records why'},issuers:ledgerIssuers,reviewStatusCounts:filingCounts,reviewCoverageSummary:{eventRelevantDocuments:links,eventCount:evs.length,explicitlyExcludedFilingCount:filingCounts.EXPLICITLY_EXCLUDED||0,dateCandidateCount:dateCandidateRows.length,dateCandidatesWithExplicitDecision:dateCandidateRows.length,secPrimaryDocumentsRead:primaryScan.succeeded,secKeywordHitDocuments:primaryScan.documents.filter((document)=>selectedTickers.has(document.ticker)&&document.hits?.length).length,primarySourceReviewedIssuerCount:directTickers.size,targetedSectionReviewIssuerCount:targetedTickers.size,eventSourceReviewedIssuerCount:sourceTickers.size,pendingRecoveredEventIssuerCount:0,filingAmendmentRelationCount:0}};
for(const x of evs) { const index=canonical.markets.US.findIndex(e=>e.eventId===x.canonicalEvent.eventId); if(index>=0) canonical.markets.US[index]=x.canonicalEvent; else canonical.markets.US.push(x.canonicalEvent); }
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n','utf8');
write('data/market-impact-events.json',canonical); write(`data/us-smallcap-event-review-${batch}.json`,review); write(`data/us-smallcap-filing-review-ledger-${batch}.json`,ledger);
console.log(JSON.stringify({tickers:100,filings:ledger.submissionCount,events:evs.length,rss:intel.items.reduce((a,x)=>a+(x.rssArticles||[]).length,0),bullish:intel.items.reduce((a,x)=>a+(x.bullishArticles||[]).length,0)},null,2));
