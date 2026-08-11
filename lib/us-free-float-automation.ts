import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { refreshUsFreeFloat } from "@/lib/us-free-float";

export async function refreshAllUsFreeFloat(options: { concurrency?: number } = {}) {
  const rows = await getDb().select({ market: usInstruments.market, code: usInstruments.code, enabled: usInstruments.enabled }).from(usInstruments).where(eq(usInstruments.enabled, true)).orderBy(asc(usInstruments.market), asc(usInstruments.code));
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const row = rows[cursor++];
      if (!row) return;
      const result = await refreshUsFreeFloat(row.code).catch((error) => ({ ok: false, ticker: row.code, error: error instanceof Error ? error.message : String(error) }));
      results.push({ ...result, market: row.market, ticker: row.code });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, worker));
  return { ok: true, source: "FMP", instrumentCount: rows.length, successCount: results.filter((result) => result.ok === true).length, failureCount: results.filter((result) => result.ok !== true).length, results };
}
