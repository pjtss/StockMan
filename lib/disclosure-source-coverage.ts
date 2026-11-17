type LatestMarketRssRun = {
  id: number;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  summary: unknown;
};
type LatestDartRun = LatestMarketRssRun;
type LatestSecRun = LatestMarketRssRun;
type CoverageQueryWindow = { kind: "KST_CALENDAR_DAY" | "ROLLING_HOURS"; from: string; to: string };

const DISCLOSURE_COVERAGE_SOURCES = [
  { source: "DART", sourceClass: "OFFICIAL_DISCLOSURE", isRss: false },
  { source: "SEC", sourceClass: "OFFICIAL_DISCLOSURE", isRss: false },
  { source: "SEC_EDGAR", sourceClass: "OFFICIAL_DISCLOSURE", isRss: true },
  { source: "KRX_KIND", sourceClass: "EXCHANGE_FEED", isRss: true },
  { source: "NEWSIS", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "MK", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "HANKYUNG", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "ETODAY", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "GLOBENEWSWIRE", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "STOCKTITAN", sourceClass: "THIRD_PARTY_RSS", isRss: true },
  { source: "NASDAQ", sourceClass: "EXCHANGE_FEED", isRss: true },
  { source: "NASDAQ_TRADER", sourceClass: "EXCHANGE_FEED", isRss: true },
] as const;
const MARKET_RSS_SCHEDULED_SOURCES = new Set(["GLOBENEWSWIRE", "SEC_EDGAR", "STOCKTITAN"]);

type FetchState = "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED" | "UNKNOWN";
type PersistState = "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_RUN" | "UNKNOWN";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeFetchedAt(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function runOverlapsQueryWindow(run: LatestMarketRssRun | null, queryWindow: CoverageQueryWindow) {
  if (!run) return false;
  const startedAt = run.startedAt.getTime();
  const finishedAt = (run.finishedAt ?? run.startedAt).getTime();
  return startedAt < Date.parse(queryWindow.to) && finishedAt >= Date.parse(queryWindow.from);
}

function kstDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("-", "");
}

function sourceResultFor(run: LatestMarketRssRun | null, source: string) {
  const summary = objectValue(run?.summary);
  const ingested = objectValue(summary?.ingested);
  const sourceResults = ingested?.sourceResults;
  const compactSample = objectValue(sourceResults)?.sample;
  const candidates = Array.isArray(sourceResults) ? sourceResults : Array.isArray(compactSample) ? compactSample : null;
  if (!candidates) return null;
  return candidates.map(objectValue).find((item) => item?.source === source) ?? null;
}

function projectDartCoverage(run: LatestDartRun | null, queryWindow: CoverageQueryWindow) {
  const summary = objectValue(run?.summary);
  const sourceResult = summary?.source === "DART" ? summary : null;
  const summaryDateKey = typeof sourceResult?.dateKey === "string" && /^\d{8}$/.test(sourceResult.dateKey) ? sourceResult.dateKey : null;
  const runDateKey = summaryDateKey ?? (run ? kstDateKey(run.startedAt.toISOString()) : null);
  const queryStartDate = kstDateKey(queryWindow.from);
  const queryEndDate = kstDateKey(new Date(new Date(queryWindow.to).getTime() - 1).toISOString());
  const queryIncludesRunDate = runDateKey !== null && queryStartDate !== null && queryEndDate !== null && runDateKey >= queryStartDate && runDateKey <= queryEndDate;
  const skipped = run?.status === "SKIPPED" || sourceResult?.skipped === true;
  if (!run || !queryIncludesRunDate) return null;

  const reconciliationState = sourceResult?.reconciliationState;
  const fetchState: FetchState = skipped
    ? "SKIPPED"
    : reconciliationState === "RECONCILED"
      ? "SUCCESS"
      : reconciliationState === "PARTIAL" || run.status === "PARTIAL"
        ? "PARTIAL"
        : run.status === "FAILED"
          ? "FAILED"
          : "UNKNOWN";
  const fullCalendarDay = queryWindow.kind === "KST_CALENDAR_DAY" && runDateKey === queryStartDate;
  const rangeCoverage = fullCalendarDay && reconciliationState === "RECONCILED"
    ? "ENUMERATED_PROVIDER_RESPONSE" as const
    : reconciliationState === "PARTIAL" && queryIncludesRunDate
      ? "PARTIAL" as const
      : "UNKNOWN" as const;
  return {
    source: "DART",
    sourceClass: "OFFICIAL_DISCLOSURE" as const,
    configuredState: "UNKNOWN" as const,
    latestAttempt: {
      runId: String(run.id),
      fetchState,
      // This automation sends alerts but does not persist the full OpenDART result in `filings`.
      persistState: "NOT_RUN" as const,
      fetchedAt: safeFetchedAt(sourceResult?.fetchedAt),
      observedAt: (run.finishedAt ?? run.startedAt).toISOString(),
      itemCount: safeCount(sourceResult?.totalDisclosures),
      rawItemCount: safeCount(sourceResult?.rawRowCount),
      deduplicatedItemCount: safeCount(sourceResult?.uniqueReceiptCount),
      upsertAffectedRowCount: null,
      snapshotStored: null,
      pageCount: safeCount(sourceResult?.pagesFetched),
      failureCode: fetchState === "PARTIAL" ? "DART_PAGE_RECONCILIATION_PARTIAL" : fetchState === "FAILED" ? "DART_COLLECTION_FAILED" : null,
    },
    lastSuccessfulPersistAt: null,
    rangeCoverage,
  };
}

function projectSecCoverage(run: LatestSecRun | null, queryWindow: CoverageQueryWindow) {
  if (!run) return null;
  const observedAt = run.finishedAt ?? run.startedAt;
  const observedTime = observedAt.getTime();
  if (observedTime < Date.parse(queryWindow.from) || observedTime >= Date.parse(queryWindow.to)) return null;
  const summary = objectValue(run.summary);
  const coverage = objectValue(summary?.submissionCoverage);
  const skipped = run.status === "SKIPPED";
  if (!coverage && !skipped) return null;
  const configuredCikCount = safeCount(coverage?.configuredCikCount);
  const fetchSuccessCikCount = safeCount(coverage?.fetchSuccessCikCount);
  const fetchFailureCikCount = safeCount(coverage?.fetchFailureCikCount);
  const unknownCikOutcomeCount = safeCount(coverage?.unknownCikOutcomeCount);
  const knownOutcomes = fetchSuccessCikCount !== null && fetchFailureCikCount !== null && unknownCikOutcomeCount !== null;
  const hasKnownSuccess = (fetchSuccessCikCount ?? 0) > 0;
  const hasKnownFailure = (fetchFailureCikCount ?? 0) > 0;
  const fetchState: FetchState = skipped
    ? "SKIPPED"
    : !knownOutcomes || configuredCikCount === 0
      ? "UNKNOWN"
      : unknownCikOutcomeCount! > 0 || (hasKnownSuccess && hasKnownFailure)
        ? "PARTIAL"
        : hasKnownFailure
          ? "FAILED"
          : hasKnownSuccess
            ? "SUCCESS"
            : "UNKNOWN";
  const persistState: PersistState = skipped
    ? "NOT_RUN"
    : !knownOutcomes
      ? "UNKNOWN"
      : unknownCikOutcomeCount! > 0
        ? "UNKNOWN"
        : hasKnownSuccess && hasKnownFailure
          ? "PARTIAL"
          : hasKnownSuccess
          ? "SUCCESS"
          : hasKnownFailure
            ? "NOT_RUN"
            : "UNKNOWN";
  const rawItemCount = safeCount(coverage?.rawItemCount);
  const upsertAffectedRowCount = safeCount(coverage?.upsertAffectedRowCount);
  const snapshotStoredCikCount = safeCount(coverage?.snapshotStoredCikCount);
  return {
    source: "SEC",
    sourceClass: "OFFICIAL_DISCLOSURE" as const,
    configuredState: skipped && summary?.reason === "disabled" ? "DISABLED" as const : "UNKNOWN" as const,
    latestAttempt: {
      runId: String(run.id),
      fetchState,
      persistState,
      fetchedAt: safeFetchedAt(coverage?.fetchedAt),
      observedAt: observedAt.toISOString(),
      itemCount: rawItemCount,
      rawItemCount,
      deduplicatedItemCount: rawItemCount,
      upsertAffectedRowCount,
      snapshotStored: snapshotStoredCikCount === null || configuredCikCount === null || configuredCikCount === 0 ? null : snapshotStoredCikCount === configuredCikCount,
      pageCount: null,
      failureCode: fetchState === "FAILED" ? "SEC_SUBMISSIONS_FETCH_FAILED" : fetchState === "PARTIAL" ? "SEC_SUBMISSIONS_PARTIAL" : null,
    },
    lastSuccessfulPersistAt: null,
    rangeCoverage: "UNKNOWN" as const,
  };
}

export function projectMarketRssSourceCoverage(run: LatestMarketRssRun | null, requestedSource: string, dartRun: LatestDartRun | null, secRun: LatestSecRun | null, queryWindow: CoverageQueryWindow) {
  return DISCLOSURE_COVERAGE_SOURCES
    .filter(({ source, isRss }) => requestedSource === "ALL" || (requestedSource === "RSS" && isRss) || requestedSource === source)
    .map(({ source, sourceClass }) => {
      if (source === "DART") return projectDartCoverage(dartRun, queryWindow) ?? {
        source,
        sourceClass,
        configuredState: "UNKNOWN" as const,
        latestAttempt: null,
        lastSuccessfulPersistAt: null,
        rangeCoverage: "UNKNOWN" as const,
      };
      if (source === "SEC") return projectSecCoverage(secRun, queryWindow) ?? {
        source,
        sourceClass,
        configuredState: "UNKNOWN" as const,
        latestAttempt: null,
        lastSuccessfulPersistAt: null,
        rangeCoverage: "UNKNOWN" as const,
      };
      const trackedByMarketRssScheduler = MARKET_RSS_SCHEDULED_SOURCES.has(source);
      const runInQueryWindow = trackedByMarketRssScheduler && runOverlapsQueryWindow(run, queryWindow);
      const result = trackedByMarketRssScheduler ? sourceResultFor(run, source) : null;
      const ingestStatus = typeof result?.ingestStatus === "string" ? result.ingestStatus : null;
      const skippedRun = runInQueryWindow && run?.status === "SKIPPED";
      const fetchState: FetchState = skippedRun || ingestStatus === "SKIPPED"
        ? "SKIPPED"
        : ingestStatus === "FETCH_FAILED"
          ? "FAILED"
          : ingestStatus === "PERSIST_FAILED"
            ? "SUCCESS"
            : ingestStatus === "STORED"
              ? "SUCCESS"
              : "UNKNOWN";
      const persistState: PersistState = skippedRun || ingestStatus === "SKIPPED" || ingestStatus === "FETCH_FAILED"
        ? "NOT_RUN"
        : ingestStatus === "PERSIST_FAILED"
          ? "FAILED"
          : ingestStatus === "STORED"
            ? "SUCCESS"
            : "UNKNOWN";
      const observedAt = runInQueryWindow && run ? (run.finishedAt ?? run.startedAt).toISOString() : null;
      const disabled = skippedRun && objectValue(run?.summary)?.reason === "disabled";
      return {
        source,
        sourceClass,
        configuredState: disabled ? "DISABLED" as const : "UNKNOWN" as const,
        latestAttempt: runInQueryWindow && run && (result !== null || run.status === "SKIPPED") ? {
          runId: String(run.id),
          fetchState,
          persistState,
          fetchedAt: safeFetchedAt(result?.fetchedAt),
          observedAt,
          // A failed fetch provides no denominator. Do not turn unavailable
          // counts into an observed zero-item response.
          itemCount: ingestStatus === "FETCH_FAILED" ? null : safeCount(result?.count),
          rawItemCount: ingestStatus === "FETCH_FAILED" ? null : safeCount(result?.rawItemCount),
          deduplicatedItemCount: ingestStatus === "FETCH_FAILED" ? null : safeCount(result?.deduplicatedItemCount),
          upsertAffectedRowCount: ingestStatus === "FETCH_FAILED" ? null : safeCount(result?.upsertAffectedRowCount),
          snapshotStored: typeof result?.snapshotStored === "boolean" ? result.snapshotStored : null,
          pageCount: null,
          failureCode: ingestStatus === "FETCH_FAILED" ? "RSS_FETCH_FAILED" : ingestStatus === "PERSIST_FAILED" ? "SOURCE_PERSIST_FAILED" : null,
        } : null,
        lastSuccessfulPersistAt: null,
        rangeCoverage: "UNKNOWN" as const,
      };
    });
}
