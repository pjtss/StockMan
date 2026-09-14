import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  try {
    const pool = getPool();
    const [summary, byType, byEndpoint, events] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS events, COUNT(DISTINCT incident_id)::int AS incidents, COUNT(*) FILTER (WHERE recovered_at IS NOT NULL)::int AS recovered, COALESCE(MAX(observed_tps), 0)::float AS max_observed_tps, COALESCE(AVG(backoff_ms), 0)::float AS avg_backoff_ms FROM kis_rate_limit_events WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day')`, [days]),
      pool.query(`SELECT limit_type, limit_scope, COUNT(*)::int AS events, COALESCE(MAX(observed_tps), 0)::float AS max_observed_tps, COALESCE(AVG(backoff_ms), 0)::float AS avg_backoff_ms FROM kis_rate_limit_events WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1, 2 ORDER BY events DESC`, [days]),
      pool.query(`SELECT endpoint, tr_id, COUNT(*)::int AS events, COALESCE(MAX(backoff_ms), 0)::int AS max_backoff_ms FROM kis_rate_limit_events WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1, 2 ORDER BY events DESC LIMIT 100`, [days]),
      pool.query(`SELECT id, request_id, endpoint, market, tr_id, http_status, kis_rt_cd, kis_msg_cd, kis_msg1_code, limit_type, limit_scope, observed_tps, configured_tps, retry_after_ms, backoff_ms, attempt, breaker_state, queued_count, inflight_count, budget_remaining, incident_id, occurred_at, recovered_at, recovery_status FROM kis_rate_limit_events ORDER BY occurred_at DESC LIMIT $1`, [limit]),
    ]);
    return NextResponse.json({ ok: true, requestId, generatedAt: new Date().toISOString(), days, summary: summary.rows[0], byType: byType.rows, byEndpoint: byEndpoint.rows, events: events.rows });
  } catch {
    return NextResponse.json({ ok: false, requestId, error: "KIS_RATE_LIMIT_EVENTS_UNAVAILABLE" }, { status: 503 });
  }
}
