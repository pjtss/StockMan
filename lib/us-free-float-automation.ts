import { getPool } from "@/lib/db";
import { refreshUsFreeFloat } from "@/lib/us-free-float";
import { saveFreeFloatRefreshHistory } from "@/lib/free-float-repository";

export async function refreshAllUsFreeFloat(options: { concurrency?: number; offset?: number; limit?: number } = {}) {
  const rowsResult = await getPool().query({ text: `
    SELECT i.market, i.code,
           s.fetched_at AS float_fetched_at
    FROM us_instruments i
    LEFT JOIN us_free_float_snapshots s ON s.ticker = i.code
    WHERE i.enabled = TRUE
    ORDER BY (s.fetched_at IS NOT NULL), s.fetched_at ASC NULLS FIRST, i.market ASC, i.code ASC
  `});
  const rows = rowsResult.rows as Array<{ market: string; code: string; float_fetched_at: string | null }>;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const requestedLimit = options.limit == null ? 250 : Math.floor(options.limit);
  const limit = Math.max(1, Math.min(requestedLimit, rows.length || 1));
  const batch = rows.slice(offset, offset + limit);
  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const row = batch[cursor++];
      if (!row) return;
      const startedAt = new Date();
      const result: Record<string, any> = await refreshUsFreeFloat(row.code, row.market).catch((error) => ({ ok: false, ticker: row.code, error: error instanceof Error ? error.message : String(error) }));
      const finishedAt = new Date();
      await saveFreeFloatRefreshHistory({
        ticker: row.code, market: row.market, startedAt, finishedAt,
        status: result.ok ? "SUCCESS" : "FAILED", source: typeof result.source === "string" ? result.source : null,
        failureReason: typeof result.error === "string" ? result.error : null,
        fmpStatus: typeof result.fmpStatus === "number" ? result.fmpStatus : null,
        secStatus: typeof result.secStatus === "number" ? result.secStatus : null,
        saved: result.ok === true && result.fetchedAt != null,
      }).catch(() => null);
      results.push({ ...result, market: row.market, ticker: row.code });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, batch.length)) }, worker));
  return {
    ok: true,
    source: "FMP",
    instrumentCount: rows.length,
    batch: { offset, limit, count: batch.length, nextOffset: offset + batch.length < rows.length ? offset + batch.length : null, hasNext: offset + batch.length < rows.length },
    successCount: results.filter((result) => result.ok === true).length,
    failureCount: results.filter((result) => result.ok !== true).length,
    savedCount: results.filter((result) => result.ok === true && result.fetchedAt != null).length,
    saveFailureCount: results.filter((result) => result.ok === true && result.fetchedAt == null).length,
    results,
  };
}
