import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { intradayMemoryState } from "@/lib/intraday-memory-state";
import { getIntradayWorkerSnapshot } from "@/lib/intraday-detection-worker";
import { getPool } from "@/lib/db";
import { loadIntradayMvpPolicy } from "@/lib/intraday-mvp-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const state = intradayMemoryState.snapshot();
  const policy = await loadIntradayMvpPolicy();
  let metrics: unknown = { source: "MEMORY_ONLY", ticks: 0, transitions: 0 };
  try { const pool = getPool(); const [ticks, transitions] = await Promise.all([pool.query(`SELECT COUNT(*)::int AS ticks, COALESCE(AVG(duration_ms),0)::float AS avg_duration_ms, COALESCE(MAX(duration_ms),0)::int AS max_duration_ms, COALESCE(SUM(planned_count),0)::int AS planned, COALESCE(SUM(executed_count),0)::int AS executed, COALESCE(SUM(failed_count),0)::int AS failed, COALESCE(SUM(deferred_count),0)::int AS deferred FROM intraday_detection_ticks WHERE observed_at >= NOW() - INTERVAL '30 minutes'`), pool.query(`SELECT COUNT(*)::int AS transitions, COUNT(*) FILTER (WHERE to_state='QUALIFIED')::int AS qualified, COUNT(*) FILTER (WHERE to_state='STALE')::int AS stale FROM intraday_detection_transitions WHERE observed_at >= NOW() - INTERVAL '30 minutes'`)]); metrics = { source: "POSTGRESQL", windowMinutes: 30, ...ticks.rows[0], ...transitions.rows[0] }; } catch { /* migration may not be applied yet */ }
  const mvpCandidates = state.candidates.filter((candidate) => candidate.mvpTracking);
  const mvpQualified = mvpCandidates.filter((candidate) => candidate.mvpQualified);
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), worker: getIntradayWorkerSnapshot(), policy, flow: { snapshot: { currentCount: state.current.length, previousCount: state.previous.length }, filters: { managedCandidates: state.candidates.length, ratioEligible: state.candidates.filter((candidate) => candidate.priority > 0).length, mvpTracking: mvpCandidates.length, mvpQualified: mvpQualified.length, mvpThreshold: policy.threshold, mvpWindowMinutes: policy.windowMinutes, mvpRequiredSamples: policy.requiredSamples }, queue: { dueCount: intradayMemoryState.dueCandidates().length, inflightCount: state.inflightCount } }, metrics, state });
}
