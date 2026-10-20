import { getPool } from "@/lib/db";

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
    return { job: null, totals: null, failuresByMarketAndCode: [], retrySamples: [] };
  }

  const [totalsResult, groupsResult, samplesResult] = await Promise.all([
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
    pool.query(
      `SELECT market, code, COALESCE(last_error_code, 'UNKNOWN_ERROR') AS error_code,
              attempt_count, next_attempt_at, updated_at
         FROM instrument_fundamental_refresh_items
        WHERE job_id = $1 AND status = 'FAILED'
        ORDER BY next_attempt_at ASC NULLS FIRST, updated_at DESC, market, code
        LIMIT 25`,
      [job.id],
    ),
  ]);

  const totalsRow = totalsResult.rows[0] ?? {};
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
    retrySamples: samplesResult.rows.map((row) => ({
      market: String(row.market),
      code: String(row.code),
      errorCode: String(row.error_code),
      attemptCount: numeric(row.attempt_count),
      nextAttemptAt: row.next_attempt_at ?? null,
      updatedAt: row.updated_at ?? null,
    })),
  };
}
