import { getPool } from "@/lib/db";
import { safeProviderCode } from "@/lib/error-diagnostics";

type RefreshJobRow = {
  id: string | number;
  status: string;
  instrument_count: string | number;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  created_at: Date | string;
};

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

const PRICE_FIELDS = ["last", "t_prpr", "price"] as const;
const MARKET_CAP_FIELDS = ["tomv", "marketCap", "market_cap"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valueState(value: unknown) {
  if (value == null) return "MISSING";
  const text = String(value).trim();
  if (!text) return "EMPTY";
  const number = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(number)) return "NON_NUMERIC";
  return number > 0 ? "POSITIVE" : "NON_POSITIVE";
}

function fieldStates(output: Record<string, unknown> | null, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, valueState(output?.[field])]));
}

function summarizeCachedProviderResponse(row: Record<string, unknown>) {
  const parsed = asRecord(row.cached_parsed);
  const outputKey = parsed
    ? (["output", "output1", "output2"] as const).find((key) => parsed[key] !== null && parsed[key] !== undefined) ?? null
    : null;
  const selectedRawOutput = outputKey ? parsed?.[outputKey] : null;
  const selectedOutput = asRecord(selectedRawOutput);
  const outputCandidates = parsed
    ? (["output", "output1", "output2"] as const).flatMap((key) => {
        const value = parsed[key];
        if (value === null || value === undefined) return [];
        const record = asRecord(value);
        return [{ key, shape: Array.isArray(value) ? "ARRAY" : record ? "OBJECT" : typeof value,
          priceFields: fieldStates(record, PRICE_FIELDS), marketCapFields: fieldStates(record, MARKET_CAP_FIELDS) }];
      })
    : [];
  const selectedPriceField = PRICE_FIELDS.find((field) => selectedOutput?.[field] != null) ?? null;
  const firstUsablePriceField = PRICE_FIELDS.find((field) => selectedOutput?.[field] != null && String(selectedOutput[field]).trim() !== "") ?? null;
  const selectedMarketCapField = MARKET_CAP_FIELDS.find((field) => selectedOutput?.[field] != null) ?? null;
  const alternativePositivePrice = outputCandidates.some((candidate) =>
    Object.values(candidate.priceFields).includes("POSITIVE"),
  );
  const fetchedAt = row.cached_fetched_at ? new Date(String(row.cached_fetched_at)).getTime() : NaN;
  const lastAttemptAt = row.last_attempt_at ?? null;
  const attemptTimeKnown = lastAttemptAt !== null && Number.isFinite(new Date(String(lastAttemptAt)).getTime());
  const failureAttemptAt = attemptTimeKnown ? new Date(String(lastAttemptAt)).getTime() : NaN;
  const deltaMs = Number.isFinite(fetchedAt) && Number.isFinite(failureAttemptAt) ? failureAttemptAt - fetchedAt : NaN;

  return {
    cacheFound: row.cached_parsed != null,
    cacheStatus: row.cached_status == null ? null : numeric(row.cached_status),
    cacheFetchedAt: row.cached_fetched_at ?? null,
    lastAttemptAt,
    attemptTimeKnown,
    cacheNearFailure: Number.isFinite(deltaMs) && Math.abs(deltaMs) <= 10 * 60_000,
    rtCd: safeProviderCode(parsed?.rt_cd) ?? "UNKNOWN",
    messageCode: safeProviderCode(parsed?.msg_cd) ?? "UNKNOWN",
    selectedOutputKey: outputKey ?? "MISSING",
    selectedOutputShape: selectedRawOutput == null ? "MISSING" : Array.isArray(selectedRawOutput) ? "ARRAY" : selectedOutput ? "OBJECT" : typeof selectedRawOutput,
    selectedPriceField: selectedPriceField ?? "MISSING",
    selectedPriceState: valueState(selectedPriceField ? selectedOutput?.[selectedPriceField] : undefined),
    firstUsablePriceField: firstUsablePriceField ?? "MISSING",
    firstUsablePriceState: valueState(firstUsablePriceField ? selectedOutput?.[firstUsablePriceField] : undefined),
    selectedMarketCapField: selectedMarketCapField ?? "MISSING",
    selectedMarketCapState: valueState(selectedMarketCapField ? selectedOutput?.[selectedMarketCapField] : undefined),
    alternativePositivePrice,
    outputCandidates,
  };
}

function incrementCount(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Read-only snapshot of the newest durable fundamentals refresh ledger. */
export async function loadInstrumentFundamentalRefreshDebug() {
  const pool = getPool();
  const jobResult = await pool.query<RefreshJobRow>(
    `SELECT id, status, instrument_count, started_at, finished_at, created_at
       FROM instrument_fundamental_refresh_jobs
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  );
  const job = jobResult.rows[0];
  if (!job) {
    return {
      job: null,
      totals: null,
      failuresByMarketAndCode: [],
      responseDiagnostics: { inspectedFailureCount: 0, totalFailureCount: 0, truncated: false, byMarketAndCode: [] },
      retrySamples: [],
    };
  }

  const [totalsResult, groupsResult, diagnosticsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_count,
              COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success_count,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
              COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
              COUNT(*) FILTER (WHERE status = 'FAILED' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))::int AS retry_due_count,
              COUNT(*) FILTER (WHERE status = 'FAILED' AND next_attempt_at IS NULL)::int AS retry_time_missing_count,
              COUNT(*) FILTER (WHERE status = 'FAILED' AND next_attempt_at > NOW())::int AS retry_deferred_count,
              MIN(next_attempt_at) FILTER (WHERE status = 'FAILED' AND next_attempt_at > NOW()) AS next_retry_at,
              MAX(updated_at) AS latest_item_updated_at
         FROM instrument_fundamental_refresh_items
        WHERE job_id = $1`,
      [job.id],
    ),
    pool.query(
      `SELECT market, COALESCE(last_error_code, 'UNKNOWN_ERROR') AS error_code,
              COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE next_attempt_at IS NULL OR next_attempt_at <= NOW())::int AS retry_due_count,
              COUNT(*) FILTER (WHERE next_attempt_at > NOW())::int AS retry_deferred_count,
              MAX(attempt_count)::int AS max_attempt_count,
              MIN(next_attempt_at) AS next_retry_at,
              MAX(updated_at) AS latest_updated_at
         FROM instrument_fundamental_refresh_items
        WHERE job_id = $1 AND status = 'FAILED'
        GROUP BY market, COALESCE(last_error_code, 'UNKNOWN_ERROR')
        ORDER BY count DESC, market, error_code`,
      [job.id],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT item.market, item.code, COALESCE(item.last_error_code, 'UNKNOWN_ERROR') AS error_code,
              item.attempt_count, item.next_attempt_at, item.updated_at,
              COUNT(*) OVER()::int AS total_failed_count,
              item.last_attempt_at, cache.status AS cached_status,
              cache.parsed AS cached_parsed, cache.fetched_at AS cached_fetched_at
         FROM instrument_fundamental_refresh_items AS item
         LEFT JOIN us_price_detail_cache AS cache
           ON cache.market = item.market AND cache.code = item.code
        WHERE item.job_id = $1 AND item.status = 'FAILED'
        ORDER BY item.next_attempt_at ASC NULLS FIRST, item.updated_at DESC, item.market, item.code
        LIMIT 500`,
      [job.id],
    ),
  ]);

  const totalsRow = totalsResult.rows[0] ?? {};
  const failedRows = diagnosticsResult.rows;
  const responseDiagnosticGroups = new Map<string, Record<string, unknown>>();
  for (const row of failedRows) {
    const provider = summarizeCachedProviderResponse(row);
    const market = String(row.market);
    const errorCode = String(row.error_code);
    const key = `${market}\u0000${errorCode}`;
    let group = responseDiagnosticGroups.get(key);
    if (!group) {
      group = {
        market, errorCode, failureCount: 0, cacheFoundCount: 0, attemptTimeKnownCount: 0,
        attemptTimeMissingCount: 0, cacheNearFailureCount: 0, cacheMissingOrOldCount: 0,
        cacheTimingUnknownCount: 0, alternativePositivePriceCount: 0,
        cacheStatusCounts: {} as Record<string, number>, rtCdCounts: {} as Record<string, number>,
        messageCodeCounts: {} as Record<string, number>, outputKeyCounts: {} as Record<string, number>,
        outputShapeCounts: {} as Record<string, number>, selectedPriceStateCounts: {} as Record<string, number>,
        selectedPriceFieldCounts: {} as Record<string, number>, firstUsablePriceStateCounts: {} as Record<string, number>,
        firstUsablePriceFieldCounts: {} as Record<string, number>, selectedMarketCapStateCounts: {} as Record<string, number>,
      };
      responseDiagnosticGroups.set(key, group);
    }
    group.failureCount = numeric(group.failureCount) + 1;
    if (provider.cacheFound) group.cacheFoundCount = numeric(group.cacheFoundCount) + 1;
    if (provider.attemptTimeKnown) {
      group.attemptTimeKnownCount = numeric(group.attemptTimeKnownCount) + 1;
      if (provider.cacheNearFailure) group.cacheNearFailureCount = numeric(group.cacheNearFailureCount) + 1;
      else group.cacheMissingOrOldCount = numeric(group.cacheMissingOrOldCount) + 1;
    } else {
      group.attemptTimeMissingCount = numeric(group.attemptTimeMissingCount) + 1;
      group.cacheTimingUnknownCount = numeric(group.cacheTimingUnknownCount) + 1;
    }
    if (provider.alternativePositivePrice) group.alternativePositivePriceCount = numeric(group.alternativePositivePriceCount) + 1;
    incrementCount(group.cacheStatusCounts as Record<string, number>, String(provider.cacheStatus ?? "MISSING"));
    incrementCount(group.rtCdCounts as Record<string, number>, String(provider.rtCd));
    incrementCount(group.messageCodeCounts as Record<string, number>, String(provider.messageCode));
    incrementCount(group.outputKeyCounts as Record<string, number>, String(provider.selectedOutputKey));
    incrementCount(group.outputShapeCounts as Record<string, number>, String(provider.selectedOutputShape));
    incrementCount(group.selectedPriceStateCounts as Record<string, number>, String(provider.selectedPriceState));
    incrementCount(group.selectedPriceFieldCounts as Record<string, number>, String(provider.selectedPriceField));
    incrementCount(group.firstUsablePriceStateCounts as Record<string, number>, String(provider.firstUsablePriceState));
    incrementCount(group.firstUsablePriceFieldCounts as Record<string, number>, String(provider.firstUsablePriceField));
    incrementCount(group.selectedMarketCapStateCounts as Record<string, number>, String(provider.selectedMarketCapState));
  }

  return {
    job: {
      id: numeric(job.id),
      status: job.status,
      instrumentCount: numeric(job.instrument_count),
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      createdAt: job.created_at,
    },
    totals: {
      total: numeric(totalsRow.total_count),
      success: numeric(totalsRow.success_count),
      failed: numeric(totalsRow.failed_count),
      pending: numeric(totalsRow.pending_count),
      retryDue: numeric(totalsRow.retry_due_count),
      retryTimeMissing: numeric(totalsRow.retry_time_missing_count),
      retryDeferred: numeric(totalsRow.retry_deferred_count),
      nextRetryAt: totalsRow.next_retry_at ?? null,
      latestItemUpdatedAt: totalsRow.latest_item_updated_at ?? null,
    },
    failuresByMarketAndCode: groupsResult.rows.map((row) => ({
      market: String(row.market),
      errorCode: String(row.error_code),
      count: numeric(row.count),
      retryDueCount: numeric(row.retry_due_count),
      retryDeferredCount: numeric(row.retry_deferred_count),
      maxAttemptCount: numeric(row.max_attempt_count),
      nextRetryAt: row.next_retry_at ?? null,
      latestUpdatedAt: row.latest_updated_at ?? null,
    })),
    responseDiagnostics: {
      inspectedFailureCount: failedRows.length,
      totalFailureCount: numeric(failedRows[0]?.total_failed_count),
      truncated: numeric(failedRows[0]?.total_failed_count) > failedRows.length,
      byMarketAndCode: [...responseDiagnosticGroups.values()].sort((a, b) => numeric(b.failureCount) - numeric(a.failureCount) || String(a.market).localeCompare(String(b.market)) || String(a.errorCode).localeCompare(String(b.errorCode))),
    },
    retrySamples: failedRows.slice(0, 25).map((row) => ({
      market: String(row.market),
      code: String(row.code),
      errorCode: String(row.error_code),
      attemptCount: numeric(row.attempt_count),
      nextAttemptAt: row.next_attempt_at ?? null,
      updatedAt: row.updated_at ?? null,
      lastAttemptAt: row.last_attempt_at ?? null,
      providerResponse: summarizeCachedProviderResponse(row),
    })),
  };
}
