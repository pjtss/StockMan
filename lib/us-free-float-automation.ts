import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { refreshUsFreeFloat } from "@/lib/us-free-float";

export async function refreshAllUsFreeFloat(options: { concurrency?: number; offset?: number; limit?: number } = {}) {
  const rows = await getDb().select({ market: usInstruments.market, code: usInstruments.code, enabled: usInstruments.enabled }).from(usInstruments).where(eq(usInstruments.enabled, true)).orderBy(asc(usInstruments.market), asc(usInstruments.code));
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const requestedLimit = options.limit == null ? rows.length : Math.floor(options.limit);
  const limit = Math.max(1, Math.min(requestedLimit, rows.length || 1));
  const batch = rows.slice(offset, offset + limit);
  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const row = batch[cursor++];
      if (!row) return;
      const result = await refreshUsFreeFloat(row.code).catch((error) => ({ ok: false, ticker: row.code, error: error instanceof Error ? error.message : String(error) }));
      results.push({ ...result, market: row.market, ticker: row.code });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, batch.length)) }, worker));
  return { ok: true, source: "FMP", instrumentCount: rows.length, batch: { offset, limit, count: batch.length, nextOffset: offset + batch.length < rows.length ? offset + batch.length : null, hasNext: offset + batch.length < rows.length }, successCount: results.filter((result) => result.ok === true).length, failureCount: results.filter((result) => result.ok !== true).length, results };
}
