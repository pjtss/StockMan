import fs from "node:fs/promises";
import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

const { Pool } = pg;
const baseUrl = process.env.PUBLIC_BASE_URL || "https://stockman.r-e.kr";
const from = "2025-10-31";
const to = "2026-11-01";
const maxMarketCap = 100_000_000;
const targetCount = 100;
const userAgent = process.env.SEC_USER_AGENT?.trim();
if (!userAgent || /example\.com|placeholder/i.test(userAgent)) throw new Error("A real SEC_USER_AGENT is required; no SEC request sent");
if (new URL(baseUrl).hostname !== "stockman.r-e.kr") throw new Error("Only the configured official operating host is allowed");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return response.json();
}
async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await fn(values[index], index);
    }
  }));
  return output;
}

loadLocalEnv({ required: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the project official instrument master; read only");
const dbUrl = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname)) throw new Error("Candidate query must use the configured local read-only mirror");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, statement_timeout: 30_000 });

try {
  const health = await json(`${baseUrl}/api/health`);
  if (health.status !== "ok") throw new Error("Operating health check failed");
  const result = await pool.query(`
    SELECT u.market,u.code,u.name,u.english_name,f.market_cap,f.currency,f.observed_at,f.fetched_at
      FROM us_common_stock_universe u
      JOIN LATERAL (SELECT market_cap,currency,observed_at,fetched_at FROM instrument_fundamental_snapshots f
        WHERE f.market=u.market AND f.code=u.code ORDER BY observed_at DESC NULLS LAST,fetched_at DESC NULLS LAST LIMIT 1) f ON true
     WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
       AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false
       AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_dr,false)=false
       AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false
       AND f.currency='USD' AND f.market_cap>0 AND f.market_cap<=$1
       AND NOT (COALESCE(u.name,'')||' '||COALESCE(u.english_name,'') ~* '(ADR|ADS|depositary|depository)')
     ORDER BY f.market_cap,u.market,u.code LIMIT 350`, [maxMarketCap]);
  const seed = result.rows;
  const tickerMap = await json("https://www.sec.gov/files/company_tickers.json", { "user-agent": userAgent, accept: "application/json" });
  const cikByTicker = new Map(Object.values(tickerMap).map((row) => [String(row.ticker).toUpperCase(), { cik: String(row.cik_str).padStart(10, "0"), title: row.title }]));
  const live = await mapLimit(seed, 6, async (candidate) => {
    try {
      const intel = await json(`${baseUrl}/api/public/market-intelligence?ticker=${encodeURIComponent(candidate.code)}&from=${from}&to=${to}&limit=100`);
      const item = intel.instrument;
      const fundamental = intel.fundamental;
      const valid = item?.market === candidate.market && item?.code === candidate.code && item.instrument_type === "COMMON_STOCK" && item.enabled &&
        !item.is_etf && !item.is_warrant && !item.is_derivative && !item.is_dr && !item.is_leveraged && !item.is_inverse &&
        fundamental?.currency === "USD" && Number(fundamental.market_cap) > 0 && Number(fundamental.market_cap) <= maxMarketCap &&
        !/\bADR\b|\bADS\b|depositary|depository/i.test(`${item.name} ${item.english_name || ""}`);
      return { candidate, intel, valid, cik: cikByTicker.get(candidate.code) || null };
    } catch (error) { return { candidate, valid: false, error: String(error) }; }
  });
  const valid = live.filter((row) => row.valid && row.cik);
  const selected = valid.slice(0, targetCount);
  if (selected.length < targetCount) throw new Error(`Only ${selected.length} candidates passed operating validation; refusing to claim 100`);

  const issuers = await mapLimit(selected, 4, async ({ candidate, intel, cik }) => {
    const submissionUrl = `https://data.sec.gov/submissions/CIK${cik.cik}.json`;
    const submissions = await json(submissionUrl, { "user-agent": userAgent, accept: "application/json" });
    const recent = submissions.filings?.recent || {};
    const filings = (recent.accessionNumber || []).map((accession, index) => ({
      accession, form: recent.form?.[index] || null, filingDate: recent.filingDate?.[index] || null,
      reportDate: recent.reportDate?.[index] || null, acceptanceDateTime: recent.acceptanceDateTime?.[index] || null,
      items: recent.items?.[index] || null, primaryDocument: recent.primaryDocument?.[index] || null,
      primaryDocDescription: recent.primaryDocDescription?.[index] || null,
      primaryDocumentUrl: recent.primaryDocument?.[index] ? `https://www.sec.gov/Archives/edgar/data/${Number(cik.cik)}/${accession.replaceAll("-", "")}/${recent.primaryDocument[index]}` : null,
      filingIndexUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik.cik)}/${accession.replaceAll("-", "")}/${accession}-index.htm`,
    })).filter((filing) => filing.filingDate >= from && filing.filingDate < to);
    return {
      cik: cik.cik, secCompanyName: submissions.name || cik.title, ticker: candidate.code, market: candidate.market,
      officialMaster: { checkedAt: intel.asOf, instrument: intel.instrument },
      marketCap: { usd: Number(intel.fundamental.market_cap), currency: intel.fundamental.currency, source: intel.fundamental.source,
        observedAt: new Date(intel.fundamental.observed_at).toISOString(), fetchedAt: new Date(intel.fundamental.fetched_at).toISOString() },
      reviewWindow: { from, toExclusive: to },
      secSubmissions: { sourceUrl: submissionUrl, fetchedAt: new Date().toISOString(), filings, filingCount: filings.length,
        rangeComplete: !(submissions.filings?.files || []).some((file) => file.filingFrom <= to && file.filingTo >= from),
        olderSubmissionFiles: submissions.filings?.files || [] },
      operatingServerSnapshot: { asOf: intel.asOf, rssArticles: intel.rssArticles || [], bullishArticles: intel.bullishArticles || [], secEvents: intel.secEvents || [] },
      eventReviewStatus: "INVENTORY_COLLECTED_PRIMARY_REVIEW_PENDING",
    };
  });
  const excluded = live.filter((row) => !row.valid || !row.cik).map((row) => ({ ticker: row.candidate.code, market: row.candidate.market,
    marketCapUsd: Number(row.candidate.market_cap), reason: row.error || (!row.cik ? "SEC_TICKER_CIK_NOT_FOUND" : "OPERATING_MASTER_CAP_OR_COMMON_STOCK_CHECK_FAILED") }));
  const record = {
    schemaVersion: "us-smallcap-event-review.v1", generatedAt: new Date().toISOString(),
    operatingServer: { baseUrl, health, readOnly: true },
    criteria: { market: "US", exchanges: ["NAS", "NYS", "AMS"], instrumentType: "active COMMON_STOCK", marketCapCurrency: "USD", marketCapMinExclusive: 0, marketCapMaxInclusive: maxMarketCap, excludeEtfWarrantDerivativeDrLeveragedInverse: true, explicitAdrAdsDepositaryNameExclusion: true, verifiedIssuerCount: issuers.length },
    reviewWindow: { filingDateFromInclusive: from, filingDateToExclusive: to, days: 366 },
    sourceMethodology: { masterAndCap: "Operating production GET /api/public/market-intelligence per ticker; active COMMON_STOCK and current stored USD fundamentals checked", submissions: "SEC official company_tickers.json and data.sec.gov/submissions/CIK##########.json; filingDate filtered, accession/form/date/items/primaryDocument preserved", news: "Operating production GET /api/public/market-intelligence; rssArticles, bullishArticles, secEvents retained with source IDs/URLs", scope: "Submission inventory and production news entries are collected; only items marked PRIMARY_SOURCE_REVIEWED may become confirmed events. No feed absence means no event." },
    universe: { count: issuers.length, issuers }, excludedCandidates: excluded,
  };
  const outputPath = "data/us-smallcap-event-review-20261031.json";
  let previousRecord = null;
  try {
    const previous = JSON.parse(await fs.readFile(outputPath, "utf8"));
    previousRecord = previous;
    const previousByTicker = new Map((previous.universe?.issuers || []).map((row) => [row.ticker, row]));
    const kept = new Set(issuers.map((row) => row.ticker));
    record.reviewedEvents = (previous.reviewedEvents || []).filter((event) => kept.has(event.ticker));
    const marketEvents = JSON.parse(await fs.readFile("data/market-impact-events.json", "utf8"));
    const eventById = new Map((marketEvents.markets?.US || []).map((event) => [event.eventId, event]));
    record.reviewedEvents = record.reviewedEvents.map((reviewedEvent) => {
      const marketEvent = eventById.get(reviewedEvent.eventId);
      const hasRecoveredSourceMetadata = Boolean(marketEvent?.recoveryMetadata);
      return { ...reviewedEvent,
        sourceReviewStatus: marketEvent ? (hasRecoveredSourceMetadata ? "RECOVERED_PENDING_REVALIDATION" : "PRIMARY_SOURCE_REVIEWED") : "SOURCE_RECORD_MISSING",
        primarySourceUrls: marketEvent?.sourceUrl ? [...new Set([marketEvent.sourceUrl, ...(marketEvent.relatedSourceUrls || [])])] : reviewedEvent.primarySourceUrls || [],
      };
    });
    const reviewedEventsByTicker = new Map();
    for (const event of record.reviewedEvents) {
      if (!reviewedEventsByTicker.has(event.ticker)) reviewedEventsByTicker.set(event.ticker, []);
      reviewedEventsByTicker.get(event.ticker).push(event);
    }
    for (const row of issuers) {
      const tickerEvents = reviewedEventsByTicker.get(row.ticker) || [];
      const hasDirectPrimaryReview = tickerEvents.some((event) => ["PRIMARY_SOURCE_REVIEWED", "FULL_PRIMARY_REVIEW_VERIFIED"].includes(event.sourceReviewStatus));
      const hasRecoveredEvent = tickerEvents.some((event) => event.sourceReviewStatus === "RECOVERED_PENDING_REVALIDATION");
      row.eventReviewStatus = hasDirectPrimaryReview ? "PRIMARY_SOURCE_REVIEWED_EVENT_FOUND"
        : hasRecoveredEvent ? "RECOVERED_EVENT_SOURCE_REVALIDATION_PENDING"
          : "SOURCE_EVENT_REVIEW_PENDING";
      row.sourceLinkedEventIds = tickerEvents.map((event) => event.eventId).filter(Boolean);
      row.eventSourceUrls = [...new Set(tickerEvents.flatMap((event) => event.primarySourceUrls || []))];
      row.reviewedEventIds = tickerEvents.filter((event) => ["PRIMARY_SOURCE_REVIEWED", "FULL_PRIMARY_REVIEW_VERIFIED"].includes(event.sourceReviewStatus)).map((event) => event.eventId).filter(Boolean);
      row.reviewedPrimarySourceUrls = [...new Set(tickerEvents.filter((event) => ["PRIMARY_SOURCE_REVIEWED", "FULL_PRIMARY_REVIEW_VERIFIED"].includes(event.sourceReviewStatus)).flatMap((event) => event.primarySourceUrls || []))];
    }
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const reviewedIssuerTickers = new Set((record.reviewedEvents || []).map((event) => event.ticker).filter(Boolean));
  const directlyReviewedIssuerTickers = new Set((record.reviewedEvents || []).filter((event) => ["PRIMARY_SOURCE_REVIEWED", "FULL_PRIMARY_REVIEW_VERIFIED"].includes(event.sourceReviewStatus)).map((event) => event.ticker));
  const recoveredEventCount = (record.reviewedEvents || []).filter((event) => event.sourceReviewStatus === "RECOVERED_PENDING_REVALIDATION").length;
  record.operatingServer = { ...(previousRecord?.operatingServer || {}), ...record.operatingServer };
  record.sourceMethodology = { ...(previousRecord?.sourceMethodology || {}), ...record.sourceMethodology };
  record.reviewStatus = { ...(previousRecord?.reviewStatus || {}), issuerCount: issuers.length,
    primarySourceReviewedIssuerCount: directlyReviewedIssuerTickers.size,
    issuerCountWithEventRecords: reviewedIssuerTickers.size,
    issuersNeedingEventSourceRevalidation: Math.max(0, reviewedIssuerTickers.size - directlyReviewedIssuerTickers.size),
    issuersWithoutEventRecords: Math.max(0, issuers.length - reviewedIssuerTickers.size),
    reconstructedEventCountPendingRevalidation: recoveredEventCount,
    eventRecordCount: record.reviewedEvents?.length || 0,
    submissionRecords: issuers.reduce((sum, row) => sum + row.secSubmissions.filingCount, 0),
    productionNewsRows: issuers.reduce((sum, row) => sum + row.operatingServerSnapshot.rssArticles.length + row.operatingServerSnapshot.bullishArticles.length, 0),
    productionClassifiedSecEventRows: issuers.reduce((sum, row) => sum + row.operatingServerSnapshot.secEvents.length, 0),
    eventCount: record.reviewedEvents?.length || 0,
    limitations: "Issuers without a manually confirmed source event have filing/news inventories only; absence of a match is not evidence of no event." };
  await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const summary = { issuers: issuers.length, filingCount: record.reviewStatus.submissionRecords, rssRows: record.reviewStatus.productionNewsRows, secEvents: record.reviewStatus.productionClassifiedSecEventRows, reviewedEvents: record.reviewStatus.eventCount, excludedCandidates: excluded.length };
  console.log(JSON.stringify(summary));
} finally { await pool.end(); }




