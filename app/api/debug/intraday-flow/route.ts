import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { intradayMemoryState } from "@/lib/intraday-memory-state";
import { getIntradayWorkerSnapshot } from "@/lib/intraday-detection-worker";
import { getPool } from "@/lib/db";
import { loadIntradayMvpPolicy } from "@/lib/intraday-mvp-policy";
import { intradayTurnoverWriteBuffer } from "@/lib/intraday-turnover-write-buffer";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const state = intradayMemoryState.snapshot();
  const policy = await loadIntradayMvpPolicy();
  let metrics: Record<string, unknown> = { source: "MEMORY_ONLY", ticks: 0, transitions: 0, status: "OBSERVABILITY_TABLES_UNAVAILABLE" };
  try {
    const pool = getPool();
    const [ticks, transitions] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS ticks, COALESCE(AVG(duration_ms),0)::float AS avg_duration_ms, COALESCE(MAX(duration_ms),0)::int AS max_duration_ms, COALESCE(SUM(planned_count),0)::int AS planned, COALESCE(SUM(executed_count),0)::int AS executed, COALESCE(SUM(failed_count),0)::int AS failed, COALESCE(SUM(deferred_count),0)::int AS deferred FROM intraday_detection_ticks WHERE observed_at >= NOW() - INTERVAL '30 minutes'`),
      pool.query(`SELECT COUNT(*)::int AS transitions, COUNT(*) FILTER (WHERE to_state='QUALIFIED')::int AS qualified, COUNT(*) FILTER (WHERE to_state='STALE')::int AS stale FROM intraday_detection_transitions WHERE observed_at >= NOW() - INTERVAL '30 minutes'`),
    ]);
    metrics = { source: "POSTGRESQL", status: "READY", windowMinutes: 30, ...ticks.rows[0], ...transitions.rows[0] };
  } catch { /* migration may not be applied yet */ }
  const writeBuffer = intradayTurnoverWriteBuffer.snapshot();
  let persistence: Record<string, unknown> = {
    table: "intraday_turnover_observations",
    status: "UNKNOWN",
    pendingCount: writeBuffer.pendingCount,
    consecutiveFailures: writeBuffer.consecutiveFailures,
    retryAt: writeBuffer.retryAt || null,
    evictedCount: writeBuffer.evictedCount,
  };
  try {
    const pool = getPool();
    const relation = await pool.query<{ exists: boolean }>("SELECT to_regclass('public.intraday_turnover_observations') IS NOT NULL AS exists");
    if (!relation.rows[0]?.exists) {
      persistence = { ...persistence, status: "TABLE_MISSING" };
    } else {
      const recent = await pool.query<{ rows: number; lastObservedAt: Date | null }>(
        "SELECT COUNT(*)::int AS rows, MAX(observed_at) AS \"lastObservedAt\" FROM intraday_turnover_observations WHERE observed_at >= NOW() - INTERVAL '30 minutes'",
      );
      const recentRows = recent.rows[0]?.rows ?? 0;
      const status = writeBuffer.pendingCount
        ? "RETRYING"
        : recentRows > 0
          ? "READY"
          : "NO_RECENT_DATA";
      persistence = { ...persistence, status, recentRows, lastObservedAt: recent.rows[0]?.lastObservedAt ?? null };
    }
  } catch {
    persistence = { ...persistence, status: "DATABASE_UNAVAILABLE" };
  }
  const mvpCandidates = state.candidates.filter((candidate) => candidate.mvpTracking);
  const mvpQualified = mvpCandidates.filter((candidate) => candidate.mvpQualified);
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), worker: getIntradayWorkerSnapshot(), policy, flow: { snapshot: { currentCount: state.current.length, previousCount: state.previous.length }, filters: { managedCandidates: state.candidates.length, ratioEligible: state.candidates.filter((candidate) => candidate.priority > 0).length, mvpTracking: mvpCandidates.length, mvpQualified: mvpQualified.length, mvpThreshold: policy.threshold, mvpWindowMinutes: policy.windowMinutes, mvpRequiredSamples: policy.requiredSamples }, queue: { dueCount: intradayMemoryState.dueCandidates().length, inflightCount: state.inflightCount, turnoverPersistence: writeBuffer } }, persistence, metrics, state });
}
