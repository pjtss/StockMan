import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getPool } from "@/lib/db";

export type FundamentalRefreshInstrument = { market: string; code: string; name: string };
export type FundamentalRefreshProgress = {
  jobId: number;
  resumed: boolean;
  instruments: FundamentalRefreshInstrument[];
  skippedCompletedCount: number;
};

export function fundamentalRefreshScopeHash(instruments: FundamentalRefreshInstrument[]) {
  const keys = instruments.map(({ market, code }) => `${market}\u0000${code}`).sort();
  return createHash("sha256").update(keys.join("\n")).digest("hex");
}

/** Start or resume the durable item ledger. The refresh advisory lock must be held by the caller. */
export async function beginFundamentalRefresh(instruments: FundamentalRefreshInstrument[]): Promise<FundamentalRefreshProgress> {
  const pool = getPool();
  const client = await pool.connect();
  const scopeHash = fundamentalRefreshScopeHash(instruments);
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE instrument_fundamental_refresh_jobs
       SET status = 'ABANDONED', finished_at = NOW()
       WHERE status IN ('RUNNING', 'PARTIAL', 'FAILED') AND scope_hash <> $1`,
      [scopeHash],
    );
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM instrument_fundamental_refresh_jobs
       WHERE scope_hash = $1 AND status IN ('RUNNING', 'PARTIAL', 'FAILED')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [scopeHash],
    );
    let jobId: number;
    const resumed = existing.rows.length > 0;
    if (resumed) {
      jobId = Number(existing.rows[0].id);
      await client.query(
        `UPDATE instrument_fundamental_refresh_jobs SET status = 'RUNNING', started_at = NOW(), finished_at = NULL, instrument_count = $2 WHERE id = $1`,
        [jobId, instruments.length],
      );
      if (instruments.length) {
        await client.query(
          `UPDATE instrument_fundamental_refresh_items AS item
           SET name = source.name, updated_at = NOW()
           FROM UNNEST($2::text[], $3::text[], $4::text[]) AS source(market, code, name)
           WHERE item.job_id = $1 AND item.market = source.market AND item.code = source.code`,
          [jobId, instruments.map((item) => item.market), instruments.map((item) => item.code), instruments.map((item) => item.name)],
        );
      }
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO instrument_fundamental_refresh_jobs (scope_hash, status, instrument_count)
         VALUES ($1, 'RUNNING', $2) RETURNING id`,
        [scopeHash, instruments.length],
      );
      jobId = Number(inserted.rows[0].id);
      if (instruments.length) {
        await client.query(
          `INSERT INTO instrument_fundamental_refresh_items (job_id, market, code, name, ordinal)
           SELECT $1, source.market, source.code, source.name, source.ordinality::integer
           FROM UNNEST($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS source(market, code, name, ordinality)`,
          [jobId, instruments.map((item) => item.market), instruments.map((item) => item.code), instruments.map((item) => item.name)],
        );
      }
    }
    // Bound ledger growth while retaining enough recent execution history for diagnosis.
    await client.query(
      `DELETE FROM instrument_fundamental_refresh_jobs
       WHERE status <> 'RUNNING' AND created_at < NOW() - INTERVAL '14 days'`,
    );
    const pending = await client.query<{ market: string; code: string; name: string; status: string }>(
      `SELECT market, code, name, status
       FROM instrument_fundamental_refresh_items
       WHERE job_id = $1 AND status <> 'SUCCESS'
       ORDER BY ordinal`,
      [jobId],
    );
    const completed = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM instrument_fundamental_refresh_items WHERE job_id = $1 AND status = 'SUCCESS'`,
      [jobId],
    );
    await client.query("COMMIT");
    return { jobId, resumed, instruments: pending.rows.map(({ market, code, name }) => ({ market, code, name })), skippedCompletedCount: Number(completed.rows[0]?.count ?? 0) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Must run inside the same transaction as the corresponding snapshot/history writes. */
export async function markFundamentalBatchInTransaction(
  tx: { execute(query: SQL): Promise<unknown> },
  jobId: number,
  succeeded: FundamentalRefreshInstrument[],
  failed: Array<FundamentalRefreshInstrument & { errorCode: string }>,
) {
  const update = async (items: FundamentalRefreshInstrument[], status: "SUCCESS" | "FAILED", errors: string[] = []) => {
    if (!items.length) return;
    const values = items.map((item, index) => sql`(${item.market}, ${item.code}, ${errors[index] ?? null})`);
    const result = await tx.execute(sql`
      UPDATE instrument_fundamental_refresh_items AS item
      SET status = ${status},
          attempt_count = item.attempt_count + 1,
          last_error_code = CASE WHEN ${status} = 'SUCCESS' THEN NULL ELSE source.error_code END,
          updated_at = NOW()
      FROM (VALUES ${sql.join(values, sql`, `)}) AS source(market, code, error_code)
      WHERE item.job_id = ${jobId} AND item.market = source.market AND item.code = source.code
    `);
    const rowCount = (result as { rowCount?: unknown } | null)?.rowCount;
    if (typeof rowCount === "number" && rowCount !== items.length) {
      throw new Error("FUNDAMENTAL_REFRESH_PROGRESS_ROW_COUNT_MISMATCH");
    }
  };
  await update(succeeded, "SUCCESS");
  await update(failed, "FAILED", failed.map((item) => item.errorCode));
}

export async function finishFundamentalRefresh(jobId: number) {
  const result = await getPool().query<{ status: string; total_count: string; success_count: string; failed_count: string; pending_count: string }>(
    `WITH counts AS (
       SELECT COUNT(*)::integer AS total_count,
              COUNT(*) FILTER (WHERE status = 'SUCCESS')::integer AS success_count,
              COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed_count,
              COUNT(*) FILTER (WHERE status = 'PENDING')::integer AS pending_count
       FROM instrument_fundamental_refresh_items WHERE job_id = $1
     )
     UPDATE instrument_fundamental_refresh_jobs AS job
     SET status = CASE
           WHEN counts.total_count = 0 OR counts.success_count = counts.total_count THEN 'SUCCESS'
           WHEN counts.success_count = 0 THEN 'FAILED'
           ELSE 'PARTIAL'
         END,
         finished_at = NOW(), instrument_count = counts.total_count
     FROM counts WHERE job.id = $1
     RETURNING job.status, counts.total_count, counts.success_count, counts.failed_count, counts.pending_count`,
    [jobId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("FUNDAMENTAL_REFRESH_JOB_NOT_FOUND");
  return { status: row.status, totalCount: Number(row.total_count), successCount: Number(row.success_count), failedCount: Number(row.failed_count), pendingCount: Number(row.pending_count) };
}
