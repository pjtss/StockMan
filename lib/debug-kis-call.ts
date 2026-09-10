import { getPool } from "@/lib/db";
import type { DebugContext } from "@/lib/debug-context";

let debugHistoryUnavailableLogged = false;

export async function recordDebugKisCall(input: { context: DebugContext; endpoint: string; trId: string; httpStatus?: number; failure?: string | null; attemptCount?: number; durationMs: number; retryable?: boolean }) {
  // This table is optional. Once its absence is detected, skip all future
  // queries for the lifetime of this process so cache workers do not pay a
  // database round-trip for every market-data request.
  if (debugHistoryUnavailableLogged) return;
  try {
    await getPool().query(`INSERT INTO debug_kis_calls (request_id, feature, market, code, timeframe, endpoint, tr_id, http_status, failure, attempt_count, duration_ms, retryable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [input.context.requestId, input.context.feature, input.context.market ?? null, input.context.code ?? null, input.context.timeframe ?? null, input.endpoint, input.trId, input.httpStatus ?? null, input.failure ?? null, input.attemptCount ?? 1, input.durationMs, input.retryable ?? false]);
  } catch (error) {
    // Debug history is optional. Avoid flooding long cache refreshes when the
    // optional table is not present; the production data path must continue.
    if (!debugHistoryUnavailableLogged) {
      debugHistoryUnavailableLogged = true;
      console.warn("[Debug] KIS call history unavailable:", error instanceof Error ? error.message : error);
    }
  }
}
