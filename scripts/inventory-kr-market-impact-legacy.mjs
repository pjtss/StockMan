import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const filePath = 'data/market-impact-events.json';
const raw = await readFile(filePath);
const payload = JSON.parse(raw.toString('utf8'));
if (payload.schemaVersion !== 'market-impact-events.v1' || !payload.markets || !Array.isArray(payload.markets.KR) || !Array.isArray(payload.markets.US) || Object.keys(payload.markets).some((market) => !['KR', 'US'].includes(market))) {
  throw new Error('Expected market-impact-events.v1 with separate KR and US arrays');
}
const rows = payload.markets.KR;
const blobHash = createHash('sha256').update(raw).digest('hex');
const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let committedBlob = null;
try {
  committedBlob = execFileSync('git', ['rev-parse', `HEAD:${filePath}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  committedBlob = null;
}
const repositoryBlob = execFileSync('git', ['hash-object', filePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const trackedBlobMatchesWorkingTree = committedBlob !== null && committedBlob === repositoryBlob;
const eventIdGroups = new Map();
const sourceTupleGroups = new Map();
const findings = [];
const manifest = [];
const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
for (const [index, row] of rows.entries()) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`markets.KR[${index}] must be an object`);
  const sourceTuple = `${row.sourceType ?? '<missing>'}:${row.sourceId ?? '<missing>'}`;
  eventIdGroups.set(row.eventId ?? '<missing>', [...(eventIdGroups.get(row.eventId ?? '<missing>') ?? []), index]);
  sourceTupleGroups.set(sourceTuple, [...(sourceTupleGroups.get(sourceTuple) ?? []), index]);
  const date = isIsoDate(row.eventDate) ? row.eventDate : null;
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  const allEvidenceLocated = evidence.length > 0 && evidence.every((item) => item && typeof item.locator === 'string' && item.locator.trim() && typeof item.sourceUrl === 'string' && /^https:\/\//.test(item.sourceUrl));
  const reasons = [];
  if (typeof row.eventId !== 'string' || !row.eventId.trim() || typeof row.sourceType !== 'string' || typeof row.sourceId !== 'string') reasons.push('MISSING_STABLE_SOURCE_IDENTITY');
  if (eventIdGroups.get(row.eventId ?? '<missing>')?.length > 1) reasons.push('DUPLICATE_EVENT_ID');
  if (sourceTupleGroups.get(sourceTuple)?.length > 1) reasons.push('DUPLICATE_SOURCE_TUPLE');
  if (!date) reasons.push('NO_VALID_DATE_ASSERTION');
  if (!allEvidenceLocated) reasons.push('EVIDENCE_LOCATOR_NOT_REPRODUCIBLE');
  if (!['DART', 'KIND'].includes(row.sourceType)) reasons.push('NON_DART_KIND_SOURCE');
  if (typeof row.ticker !== 'string' || !/^[A-Z0-9._-]{1,32}$/.test(row.ticker)) reasons.push('INVALID_TICKER');
  const finding = {
    index,
    eventId: row.eventId ?? null,
    sourceTuple,
    ticker: row.ticker ?? null,
    eventDate: date,
    legacyDateStatus: date ? 'UNVERIFIED_LEGACY_DATE' : 'NO_DATE_ASSERTION',
    migrationDisposition: 'QUARANTINED',
    dateKind: null,
    certainty: null,
    evidenceCount: evidence.length,
    allEvidenceLocated,
    originalSourceSha256: null,
    summaryFactClaimIds: [],
    analysisTrust: typeof row.summary === 'string' && row.summary.length ? 'LEGACY_UNVERIFIED_TEXT' : 'NO_SUMMARY',
    rightsDecisionRef: null,
    stableInstrumentId: null,
    reasons: reasons.length ? reasons : ['REQUIRES_SOURCE_HASH_DATE_KIND_RIGHTS_AND_INSTRUMENT_REVIEW'],
  };
  findings.push(finding);
  manifest.push({
    manifestSchemaVersion: 'kr-event-legacy-mapping.v1',
    legacyEventId: row.eventId ?? null,
    sourceType: row.sourceType ?? null,
    sourceId: row.sourceId ?? null,
    sourceTuple,
    sourceArtifactPath: filePath,
    sourceArtifactSha256: blobHash,
    sourceArtifactGitBlob: repositoryBlob,
    committedSourceBlob: committedBlob,
    sourceCommittedAtInventory: trackedBlobMatchesWorkingTree,
    repositoryCommit,
    targetEventId: null,
    ticker: row.ticker ?? null,
    companyName: row.companyName ?? null,
    legacyEventDate: date,
    dateDecision: finding.legacyDateStatus,
    dateKind: null,
    certainty: null,
    documentHash: null,
    rightsDecisionRef: null,
    stableInstrumentId: null,
    analysisTrust: finding.analysisTrust,
    evidenceCount: evidence.length,
    evidenceLocatorsPresent: allEvidenceLocated,
    disposition: 'QUARANTINED',
    reasons: finding.reasons,
    reviewer: null,
    reviewedAt: null,
  });
}
const repeated = (map) => [...map.entries()].filter(([, indexes]) => indexes.length > 1).map(([key, indexes]) => ({ key, count: indexes.length, indexes }));
const eventIdDuplicates = repeated(eventIdGroups);
const sourceTupleDuplicates = repeated(sourceTupleGroups);const dateCount = findings.filter((item) => item.eventDate !== null).length;
const report = {
  schemaVersion: 'kr-market-impact-events-legacy-inventory.v2',
  classification: 'READ_ONLY_INVENTORY_NOT_APPROVAL',
  source: { path: filePath, schemaVersion: payload.schemaVersion, byteLength: raw.length, sha256: blobHash, gitBlob: repositoryBlob, committedGitBlob: committedBlob, trackedBlobMatchesWorkingTree, repositoryCommit },
  policy: { allRowsQuarantined: true, manifestOutputOnly: true, note: 'No instrument master, DART/KIND source document, source rights, cap eligibility, or reviewer decision is verified by this local inventory.' },
  totals: {
    krRows: rows.length,
    uniqueEventIds: new Set(rows.map((row) => row.eventId).filter(Boolean)).size,
    uniqueSourceTuples: new Set(rows.map((row) => `${row.sourceType ?? ''}:${row.sourceId ?? ''}`)).size,
    rowsWithDate: dateCount,
    rowsWithEvidence: findings.filter((row) => row.evidenceCount > 0).length,
    rowsWithAllEvidenceLocated: findings.filter((row) => row.allEvidenceLocated).length,
    rowsWithSummary: rows.filter((row) => typeof row.summary === 'string' && row.summary.length > 0).length,
    rowsWithDateKind: 0,
    rowsWithCertainty: 0,
    rowsWithSourceDocumentHash: 0,
    rowsWithRightsDecisionRef: 0,
    rowsWithStableInstrumentId: 0,
    rowsWithVerifiedFactClaimIds: 0,
  },
  duplicates: { eventIds: eventIdDuplicates, sourceTuples: sourceTupleDuplicates },
  manifestStatuses: { mapped: 0, quarantined: manifest.length, duplicate: 0, rejected: 0 },
  findings,
  manifest,
};
const output = `${JSON.stringify(report, null, 2)}
`;
if (process.argv.includes('--manifest-only')) console.log(`${JSON.stringify(manifest, null, 2)}
`);
else console.log(`${JSON.stringify(report, null, 2)}
`);
