import fs from "node:fs";
import { findDuplicateMarketImpactEventIdentities } from "./market-impact-event-identity.mjs";

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const paths = {
  events: arg("events", "data/market-impact-events.json"),
  review: arg("review", "data/us-smallcap-event-review-20261031.json"),
  ledger: arg("ledger", "data/us-smallcap-filing-review-ledger-20261031.json"),
};
const expectedBatch = arg("batch", null);

function readJson(path) {
  const text = fs.readFileSync(path, "utf8");
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values = []) {
  return [...new Set(values)].sort();
}

function sameList(a = [], b = []) {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

const eventsDocument = readJson(paths.events);
const review = readJson(paths.review);
const ledger = readJson(paths.ledger);
const batchReviewPattern = /^us-smallcap-event-review-(\d{8}(?:-b\d{2})?)\.json$/;
const currentReviewPath = paths.review.replace(/\\/g, "/");
const currentBatchTickers = new Set((review.universe?.issuers || []).map((issuer) => issuer.ticker));
if (expectedBatch) {
  const reviewDirectoryPath = new URL("../data/", import.meta.url);
  for (const entry of fs.readdirSync(reviewDirectoryPath, { withFileTypes: true })) {
    const filename = entry.name;
    if (!entry.isFile()) continue;
    const match = filename.match(batchReviewPattern);
    if (!match) continue;
    const candidatePath = `data/${filename}`;
    if (candidatePath.replace(/\\/g, "/") === currentReviewPath) continue;
    const priorReview = JSON.parse(fs.readFileSync(new URL(filename, reviewDirectoryPath), "utf8"));
    const overlap = (priorReview.universe?.issuers || [])
      .map((issuer) => issuer.ticker)
      .filter((ticker) => currentBatchTickers.has(ticker));
    assert(overlap.length === 0,
      `Issuer ticker overlaps another persisted batch ${match[1]}: ${sorted(overlap).join(", ")}`);
  }
}
if (expectedBatch) {
  assert(review.batchId === expectedBatch && ledger.batchId === expectedBatch,
    `Batch ID mismatch: expected ${expectedBatch}, got ${review.batchId}/${ledger.batchId}`);
  const expectedPrefix = `batch_${expectedBatch.replace(/-/g, "_")}`;
  const reviewedAccessions = new Set(ledger.issuers.flatMap((issuer) => issuer.filings
    .filter((filing) => filing.reviewBatch === expectedPrefix && filing.reviewStatus !== "INVENTORY_ONLY")
    .map((filing) => `${issuer.ticker}|${filing.accession}`)));
  const eventAccessions = new Set(review.reviewedEvents.flatMap((row) => (row.sourceIds || []).map((accession) => `${row.ticker}|${accession}`)));
  assert(reviewedAccessions.size === eventAccessions.size && [...reviewedAccessions].every((accession) => eventAccessions.has(accession)),
    `Reviewed accession set does not match event source accession set: ${reviewedAccessions.size}/${eventAccessions.size}`);
  assert(review.reviewWindow?.batchId === expectedBatch && ledger.reviewWindow?.batchId === expectedBatch,
    `Review window batch ID mismatch: expected ${expectedBatch}`);
  assert(review.universe.issuerCount === 100 && ledger.issuerCount === 100,
    `Expected 100 issuers for ${expectedBatch}`);
  for (const row of review.reviewedEvents) {
    if (row.sourceReviewStatus === "TARGETED_SECTION_REVIEW") {
      assert((row.sourceIds || []).length > 0, `SEC targeted review is missing accession: ${row.eventId}`);
    } else if (row.sourceReviewStatus === "PRIMARY_SOURCE_REVIEWED") {
      assert((row.primarySourceUrls || []).some(url => /^https:\/\//.test(url)), `Direct primary-source review is missing a URL: ${row.eventId}`);
    } else {
      assert(false, `Unsupported event source review status for ${row.eventId}: ${row.sourceReviewStatus}`);
    }
  }
}
const allCanonicalEvents = eventsDocument.markets?.US;
assert(Array.isArray(allCanonicalEvents), "market-impact-events.json must contain markets.US[]");
const duplicateCanonicalIdentities = findDuplicateMarketImpactEventIdentities(
  allCanonicalEvents.map((event) => ({ ...event, market: "US", eventKey: event.eventKey ?? "DEFAULT" })),
);
assert(duplicateCanonicalIdentities.length === 0,
  `Canonical US events contain duplicate database identities: ${duplicateCanonicalIdentities.slice(0, 10).map((item) => `${item.eventId}/${item.duplicateEventId}`).join(", ")}`);
const reviewEventIds = new Set((review.reviewedEvents || []).map((row) => row.eventId));
const canonicalEvents = allCanonicalEvents.filter((event) => reviewEventIds.has(event.eventId));
const allowed = {
  status: new Set(["REPORTED", "CONFIRMED_SCHEDULED", "ESTIMATED", "COMPLETED", "CANCELLED"]),
  direction: new Set(["POSITIVE", "NEGATIVE", "MIXED", "UNCERTAIN"]),
  impactHorizon: new Set(["INTRADAY", "SHORT_TERM", "LONG_TERM", "UNKNOWN"]),
  confidence: new Set(["HIGH", "MEDIUM", "LOW"]),
};

const reviewIssuerByTicker = new Map(review.universe.issuers.map((issuer) => [issuer.ticker, issuer]));
assert(reviewIssuerByTicker.size === review.universe.issuers.length, "Review universe contains duplicate ticker rows");
const selectionCounts = review.sourceMethodology?.candidateCounts;
if (selectionCounts) {
  for (const field of ["localUniverse", "fundamentalsReturned", "usdMarketCapAtOrBelow100mAfterPriorExclusions", "metadataCheckedUntil100Valid", "previousBatchTickersExcluded"]) {
    assert(Number.isInteger(selectionCounts[field]) && selectionCounts[field] >= 0, `Invalid candidate selection count: ${field}`);
  }
  assert(selectionCounts.fundamentalsReturned === selectionCounts.localUniverse, "Fundamentals response coverage does not match local universe");
  assert(selectionCounts.usdMarketCapAtOrBelow100mAfterPriorExclusions >= 100, "Candidate pool is smaller than the batch size");
  assert(selectionCounts.metadataCheckedUntil100Valid >= 100, "Operating master metadata checks do not cover 100 selected issuers");
}
const eventById = new Map();
const secCik = (url) => url?.match(/sec\.gov\/Archives\/edgar\/data\/(\d+)\//i)?.[1]?.replace(/^0+/, "") || null;
const capBounds = review.criteria?.marketCap;
for (const issuer of review.universe.issuers) {
  const instrument = issuer.officialMaster?.instrument;
  assert(instrument?.instrument_type === "COMMON_STOCK" && instrument.enabled === true,
    `Issuer is not confirmed active COMMON_STOCK in the operating master: ${issuer.ticker}`);
  for (const flag of ["is_etf", "is_warrant", "is_derivative", "is_dr", "is_leveraged", "is_inverse"]) {
    if (instrument[flag] !== undefined) assert(instrument[flag] === false, `Non-common instrument flag ${flag} is set for ${issuer.ticker}`);
  }
  assert(issuer.marketCap?.currency === capBounds?.currency && Number.isFinite(issuer.marketCap?.usd),
    `Issuer market-cap snapshot is missing or has the wrong currency: ${issuer.ticker}`);
  assert(issuer.marketCap.usd > (capBounds?.minExclusive ?? 0) && issuer.marketCap.usd <= capBounds?.maxInclusive,
    `Issuer market-cap snapshot is outside the declared universe bounds: ${issuer.ticker}`);
  if (issuer.secCompanyMaster?.cik) {
    assert(String(issuer.secCompanyMaster.cik).replace(/^0+/, "") === String(issuer.cik).replace(/^0+/, ""),
      `Issuer CIK differs from the official SEC ticker master: ${issuer.ticker}`);
  }
}
for (const event of canonicalEvents) {
  const issuer = reviewIssuerByTicker.get(event.ticker);
  const expectedCik = String(issuer?.cik || "").replace(/^0+/, "");
  for (const url of [event.sourceUrl, ...((event.evidence || []).map((item) => item.sourceUrl))]) {
    const citedCik = secCik(url);
    if (!citedCik) continue;
    const isExplicitRelated = (event.relatedSourceUrls || []).includes(url);
    assert(citedCik === expectedCik || isExplicitRelated, `SEC citation issuer CIK mismatch for ${event.eventId}: ${url}`);
  }
  assert(event.eventId && event.ticker && event.eventDate && event.status, "Canonical event is missing an identity or schedule field");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate) && !Number.isNaN(Date.parse(`${event.eventDate}T00:00:00Z`)), `Invalid eventDate: ${event.eventId}`);
  if (event.datePrecision !== undefined) {
    assert(new Set(["DAY", "MONTH", "PART_OF_MONTH", "QUARTER", "RANGE", "UNDATED", "APPROXIMATE_DAY"]).has(event.datePrecision), `Invalid datePrecision for ${event.eventId}`);
    if (event.datePrecision === "MONTH") {
      assert(event.eventDateRole === "ANNOUNCEMENT", `Month-window target must identify announcement-date role: ${event.eventId}`);
      const window = event.scheduleWindow;
      assert(window?.precision === "MONTH" && window?.basis === "ISSUER_TARGET", `Month-precision event is missing its issuer target window: ${event.eventId}`);
      for (const field of ["startDate", "endDate"]) assert(/^\d{4}-\d{2}-\d{2}$/.test(window[field] || "") && !Number.isNaN(Date.parse(`${window[field]}T00:00:00Z`)), `Invalid scheduleWindow.${field} for ${event.eventId}`);
      const start = new Date(`${window.startDate}T00:00:00Z`), end = new Date(`${window.endDate}T00:00:00Z`);
      const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
      assert(window.startDate.slice(0, 7) === window.endDate.slice(0, 7) && start.getUTCDate() === 1 && end.getUTCDate() === lastDay, `Month scheduleWindow must cover exactly one calendar month: ${event.eventId}`);
    } else if (event.datePrecision === "PART_OF_MONTH") {
      assert(event.eventDateRole === "ANNOUNCEMENT", `Part-of-month target must identify announcement-date role: ${event.eventId}`);
      const window = event.scheduleWindow;
      assert(window?.precision === "PART_OF_MONTH" && window?.basis === "ISSUER_TARGET" && /^\d{4}-(0[1-9]|1[0-2])$/.test(window.month || "") && new Set(["EARLY", "MID", "LATE"]).has(window.part), `Part-of-month target is invalid: ${event.eventId}`);
    } else if (event.datePrecision === "RANGE") {
      assert(event.eventDateRole === "REPORTED_EVENT", `Ranged event must identify reported-event date role: ${event.eventId}`);
      const window = event.scheduleWindow;
      assert(window?.precision === "DAY_RANGE" && window?.basis === "REPORTED_EVENT_PERIOD", `Ranged event is missing its reported date window: ${event.eventId}`);
      for (const field of ["startDate", "endDate"]) assert(/^\d{4}-\d{2}-\d{2}$/.test(window[field] || "") && !Number.isNaN(Date.parse(`${window[field]}T00:00:00Z`)), `Invalid scheduleWindow.${field} for ${event.eventId}`);
      assert(window.startDate <= window.endDate, `Reversed scheduleWindow for ${event.eventId}`);
    } else if (event.datePrecision === "QUARTER") {
      assert(event.eventDateRole === "ANNOUNCEMENT", `Quarter-target event must identify announcement-date role: ${event.eventId}`);
      const window = event.scheduleWindow;
      assert(window?.precision === "QUARTER" && window?.basis === "ISSUER_TARGET", `Quarter-precision event is missing its issuer-target window: ${event.eventId}`);
      for (const field of ["startDate", "endDate"]) assert(/^\d{4}-\d{2}-\d{2}$/.test(window[field] || "") && !Number.isNaN(Date.parse(`${window[field]}T00:00:00Z`)), `Invalid scheduleWindow.${field} for ${event.eventId}`);
      assert(window.startDate <= window.endDate, `Reversed scheduleWindow for ${event.eventId}`);
    } else if (event.datePrecision === "APPROXIMATE_DAY") {
      assert(event.eventDateRole === "ANNOUNCEMENT", `Approximate target must identify announcement-date role: ${event.eventId}`);
      const window = event.scheduleWindow;
      assert(window?.precision === "APPROXIMATE_DAY" && window?.basis === "ISSUER_TARGET", `Approximate-day event is missing issuer target: ${event.eventId}`);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(window.targetDate || "") && !Number.isNaN(Date.parse(`${window.targetDate}T00:00:00Z`)), `Invalid scheduleWindow.targetDate for ${event.eventId}`);
    } else {
      assert(event.eventDateRole === "ANNOUNCEMENT", `Undated plan must identify announcement-date role: ${event.eventId}`);
      assert(event.scheduleWindow === null, `Non-quarter or undated event must not imply a calendar window: ${event.eventId}`);
    }
  }
  for (const [field, values] of Object.entries(allowed)) assert(values.has(event[field]), `Invalid ${field} for ${event.eventId}: ${event[field]}`);
  assert(!eventById.has(event.eventId), `Duplicate canonical eventId: ${event.eventId}`);
  eventById.set(event.eventId, event);
}

const reviewRows = review.reviewedEvents || [];
const reviewById = new Map();
for (const row of reviewRows) {
  assert(!reviewById.has(row.eventId), `Duplicate reviewed eventId: ${row.eventId}`);
  reviewById.set(row.eventId, row);
  const event = eventById.get(row.eventId);
  assert(event, `Reviewed event is absent from canonical events: ${row.eventId}`);
  assert(event.ticker === row.ticker && event.eventDate === row.eventDate && event.status === row.status,
    `Canonical/review event parity mismatch: ${row.eventId}`);
}
assert(reviewById.size === eventById.size, `Canonical/review event count mismatch: ${eventById.size}/${reviewById.size}`);
assert(review.reviewStatus?.eventCount === eventById.size, "reviewStatus.eventCount does not match canonical US events");
assert(review.reviewStatus?.eventRecordCount === eventById.size, "reviewStatus.eventRecordCount does not match canonical US events");
const directReviewStatuses = new Set(["PRIMARY_SOURCE_REVIEWED", "FULL_PRIMARY_REVIEW_VERIFIED"]);
const directlyReviewedTickers = new Set(reviewRows.filter((row) => directReviewStatuses.has(row.sourceReviewStatus)).map((row) => row.ticker));
const targetedReviewTickers = new Set(reviewRows.filter((row) => row.sourceReviewStatus === "TARGETED_SECTION_REVIEW").map((row) => row.ticker));
const sourceReviewedTickers = new Set([...directlyReviewedTickers, ...targetedReviewTickers]);
const pendingReviewRows = reviewRows.filter((row) => row.sourceReviewStatus === "RECOVERED_PENDING_REVALIDATION");
const pendingReviewTickers = new Set(pendingReviewRows.map((row) => row.ticker));
assert(review.reviewStatus?.primarySourceReviewedIssuerCount === directlyReviewedTickers.size,
  "reviewStatus.primarySourceReviewedIssuerCount does not match directly reviewed event issuers");
assert(review.reviewStatus?.targetedSectionReviewIssuerCount === targetedReviewTickers.size,
  "reviewStatus.targetedSectionReviewIssuerCount does not match targeted event issuers");
assert(review.reviewStatus?.eventSourceReviewedIssuerCount === sourceReviewedTickers.size,
  "reviewStatus.eventSourceReviewedIssuerCount does not match source-reviewed event issuers");
assert(review.reviewStatus?.recoveredEventRevalidationPendingCount === pendingReviewRows.length,
  "reviewStatus.recoveredEventRevalidationPendingCount does not match pending recovered events");
assert(review.reviewStatus?.recoveredEventRevalidationPendingIssuerCount === pendingReviewTickers.size,
  "reviewStatus.recoveredEventRevalidationPendingIssuerCount does not match pending recovered issuers");

const ledgerIssuerByTicker = new Map(ledger.issuers.map((issuer) => [issuer.ticker, issuer]));
assert(ledgerIssuerByTicker.size === reviewIssuerByTicker.size, "Issuer count mismatch between review JSON and filing ledger");
const accessionSetByTicker = new Map([...ledgerIssuerByTicker].map(([ticker, issuer]) => [ticker, new Set(issuer.filings.map((filing) => filing.accession))]));
for (const [ticker, issuer] of reviewIssuerByTicker) {
  for (const eventId of issuer.reviewedEventIds || []) {
    assert(eventById.get(eventId)?.ticker === ticker, `Issuer reviewedEventIds contains missing or cross-ticker event: ${ticker}/${eventId}`);
  }
}
for (const row of reviewRows) {
  const issuer = reviewIssuerByTicker.get(row.ticker);
  const event = eventById.get(row.eventId);
  for (const url of row.primarySourceUrls || []) {
    const citedCik = secCik(url);
    const expectedCik = String(issuer?.cik || "").replace(/^0+/, "");
    const explicitlyRelated = (event?.relatedSourceUrls || []).includes(url);
    assert(!citedCik || citedCik === expectedCik || explicitlyRelated,
      `Review-row SEC source issuer CIK mismatch for ${row.eventId}: ${url}`);
  }
  if (typeof row.validationNotes === "string") {
    for (const citedAccession of row.validationNotes.match(/\b\d{10}-\d{2}-\d{6}\b/g) || []) {
      const relatedAccessionUrl = (event?.relatedSourceUrls || []).some((url) => url.replace(/-/g, "").includes(citedAccession.replace(/-/g, "")));
      assert(accessionSetByTicker.get(row.ticker)?.has(citedAccession) || (row.sourceIds || []).includes(citedAccession) || relatedAccessionUrl,
        `Review validation note cites an accession outside its issuer/source relations: ${row.ticker}/${row.eventId}/${citedAccession}`);
    }
  }
  if (!directReviewStatuses.has(row.sourceReviewStatus)) continue;
  assert(issuer?.reviewedEventIds?.includes(row.eventId), `Issuer reviewedEventIds missing primary reviewed event: ${row.eventId}`);
  assert(String(issuer?.eventReviewStatus || "").startsWith("PRIMARY_SOURCE_REVIEWED"), `Issuer event review status is not primary-reviewed: ${row.ticker}`);
}

const statusCounts = {};
const expectedLinks = [];
const amendmentPairs = new Set();
for (const [ticker, issuer] of ledgerIssuerByTicker) {
  const reviewIssuer = reviewIssuerByTicker.get(ticker);
  assert(reviewIssuer, `Issuer missing from review JSON: ${ticker}`);
  assert(issuer.cik === reviewIssuer.cik, `CIK mismatch for ${ticker}`);
  if (issuer.secCompanyMaster || reviewIssuer.secCompanyMaster) {
    assert(String(issuer.secCompanyMaster?.cik || "").replace(/^0+/, "") === String(reviewIssuer.secCompanyMaster?.cik || "").replace(/^0+/, ""),
      `Official SEC ticker-master CIK differs between review and ledger: ${ticker}`);
  }
  const ledgerFilings = new Map(issuer.filings.map((filing) => [filing.accession, filing]));
  const reviewFilings = new Map(reviewIssuer.secSubmissions.filings.map((filing) => [filing.accession, filing]));
  assert(ledgerFilings.size === reviewFilings.size, `Filing count mismatch for ${ticker}`);

  for (const [accession, filing] of ledgerFilings) {
    const copy = reviewFilings.get(accession);
    assert(copy, `Filing missing from review copy: ${ticker}/${accession}`);
    assert(sorted(filing.eventIds).length === (filing.eventIds || []).length, `Duplicate eventId in filing ledger: ${ticker}/${accession}`);
    assert(sorted(copy.eventIds).length === (copy.eventIds || []).length, `Duplicate eventId in review filing copy: ${ticker}/${accession}`);
    assert(copy.reviewStatus === filing.reviewStatus, `Filing status mismatch: ${ticker}/${accession}`);
    assert(sameList(copy.eventIds, filing.eventIds), `Filing eventIds mismatch: ${ticker}/${accession}`);
    const relations = (filing.relatedFilings || []).map((x) => `${x.accession}|${x.relationshipType}`).sort();
    const copiedRelations = (copy.relatedFilings || []).map((x) => `${x.accession}|${x.relationshipType}`).sort();
    assert(JSON.stringify(relations) === JSON.stringify(copiedRelations), `Filing relatedFilings mismatch: ${ticker}/${accession}`);
    assert(new Set(relations).size === relations.length, `Duplicate relatedFiling relation: ${ticker}/${accession}`);
    statusCounts[filing.reviewStatus] = (statusCounts[filing.reviewStatus] || 0) + 1;

    for (const eventId of sorted(filing.eventIds)) {
      assert(reviewEventIds.has(eventId) && eventById.has(eventId), `Filing points to missing batch canonical event: ${ticker}/${accession}/${eventId}`);
      expectedLinks.push(`${ticker}|${accession}|${eventId}`);
    }
  }

  if (expectedBatch) {
    assert(issuer.secCompanyMaster?.cik, `Official SEC company ticker master CIK is missing for ${ticker}`);
    for (const filing of ledgerFilings.values()) {
      if (filing.reviewStatus === "INVENTORY_ONLY") continue;
      assert(filing.reviewBatch === `batch_${expectedBatch.replace(/-/g, "_")}`, `Reviewed filing has a mismatched batch for ${ticker}/${filing.accession}`);
      const filingCik = secCik(filing.url);
      assert(filingCik === String(issuer.cik).replace(/^0+/, ""), `Reviewed filing URL CIK differs from issuer for ${ticker}/${filing.accession}`);
    }
  }

  const inverseRelationship = { AMENDS: "AMENDED_BY", AMENDED_BY: "AMENDS" };
  for (const [accession, filing] of ledgerFilings) {
    for (const relation of filing.relatedFilings || []) {
      assert(relation.accession !== accession, `Filing cannot relate to itself: ${ticker}/${accession}`);
      assert(inverseRelationship[relation.relationshipType], `Unsupported filing relationship type: ${ticker}/${accession}/${relation.relationshipType}`);
      const target = ledgerFilings.get(relation.accession);
      assert(target, `Related filing does not exist for issuer: ${ticker}/${accession}/${relation.accession}`);
      assert((target.relatedFilings || []).some((x) => x.accession === accession && x.relationshipType === inverseRelationship[relation.relationshipType]),
        `Filing relationship lacks reciprocal link: ${ticker}/${accession}/${relation.accession}`);
      if (relation.relationshipType === "AMENDS") amendmentPairs.add(`${ticker}|${accession}|${relation.accession}`);
    }
  }
}

assert(ledger.submissionCount === Object.values(statusCounts).reduce((sum, count) => sum + count, 0), "Ledger submissionCount mismatch");
for (const [label, counts] of Object.entries({
  ledger: ledger.reviewStatusCounts,
  reviewStatus: review.reviewStatus.filingReviewStatusCounts,
  reviewCounts: review.reviewStatus.filingCountsByStatus,
})) {
  assert(JSON.stringify(Object.fromEntries(Object.entries(statusCounts).sort())) === JSON.stringify(Object.fromEntries(Object.entries(counts).sort())),
    `${label} filing status counts do not match accession rows`);
}

const actualLinks = (ledger.reviewCoverageSummary?.eventRelevantDocuments || [])
  .map((row) => `${row.ticker}|${row.accession}|${row.eventId}`);
assert(new Set(actualLinks).size === actualLinks.length, "Duplicate accession-event relation in reviewCoverageSummary");
assert(JSON.stringify([...actualLinks].sort()) === JSON.stringify([...expectedLinks].sort()), "Accession-event relation index differs from filing rows");
assert((ledger.reviewCoverageSummary?.filingAmendmentRelationCount || 0) === amendmentPairs.size,
  "Filing amendment relation count does not match accession rows");
assert(ledger.reviewCoverageSummary?.eventCount === eventById.size, "Ledger eventCount does not match canonical events");
assert(ledger.reviewCoverageSummary?.primarySourceReviewedIssuerCount === directlyReviewedTickers.size, "Ledger primary-reviewed issuer count does not match event review rows");
assert(ledger.reviewCoverageSummary?.targetedSectionReviewIssuerCount === targetedReviewTickers.size, "Ledger targeted-review issuer count does not match event review rows");
assert(ledger.reviewCoverageSummary?.eventSourceReviewedIssuerCount === sourceReviewedTickers.size, "Ledger source-reviewed issuer count does not match event review rows");
assert(ledger.reviewCoverageSummary?.pendingRecoveredEventIssuerCount === pendingReviewTickers.size, "Ledger pending recovered issuer count does not match event review rows");

for (const event of canonicalEvents) {
  const accession = event.sourceId?.match(/\d{10}-\d{2}-\d{6}/)?.[0];
  if (!accession) continue; // Non-SEC events use their external source ID as the primary identifier.
  const filing = ledgerIssuerByTicker.get(event.ticker)?.filings.find((row) => row.accession === accession);
  assert(filing?.eventIds?.includes(event.eventId), `SEC event has no matching accession relation: ${event.eventId}`);
}

console.log(JSON.stringify({
  status: "OK",
  issuerCount: ledgerIssuerByTicker.size,
  canonicalUsEventCount: allCanonicalEvents.length,
  batchUsEventCount: canonicalEvents.length,
  submissionCount: ledger.submissionCount,
  usEventCount: canonicalEvents.length,
  accessionEventRelations: expectedLinks.length,
  filingAmendmentRelations: amendmentPairs.size,
  filingStatusCounts: statusCounts,
}, null, 2));
