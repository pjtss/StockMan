import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401, headers: { "x-request-id": requestId } });
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));
  try {
    const pool = getPool();
    const [summary, daily, hourly, features] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE failure IS NULL AND http_status BETWEEN 200 AND 299)::int AS success, COUNT(*) FILTER (WHERE failure IS NOT NULL OR http_status < 200 OR http_status >= 300)::int AS failures, COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms, COALESCE(MAX(duration_ms), 0)::int AS max_duration_ms FROM debug_kis_calls WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 day')`, [days]),
      pool.query(`SELECT DATE(observed_at) AS day, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE failure IS NULL AND http_status BETWEEN 200 AND 299)::int AS success, COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms FROM debug_kis_calls WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY DATE(observed_at) ORDER BY day DESC`, [days]),
      pool.query(`SELECT date_trunc('hour', observed_at) AS hour, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE failure IS NULL AND http_status BETWEEN 200 AND 299)::int AS success, COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms FROM debug_kis_calls WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY hour DESC LIMIT 168`, [days]),
      pool.query(`SELECT COALESCE(feature, 'unknown') AS feature, COALESCE(market, 'ALL') AS market, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE failure IS NULL AND http_status BETWEEN 200 AND 299)::int AS success, COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms, COALESCE(MAX(duration_ms), 0)::int AS max_duration_ms FROM debug_kis_calls WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1, 2 ORDER BY calls DESC LIMIT 100`, [days]),
    ]);
    const result = await pool.query(`SELECT id, request_id, feature, market, code, timeframe, endpoint, tr_id, http_status, failure, attempt_count, duration_ms, retryable, observed_at FROM debug_kis_calls ORDER BY observed_at DESC LIMIT $1`, [limit]);
    return NextResponse.json({ ok: true, requestId, generatedAt: new Date().toISOString(), days, summary: summary.rows[0], daily: daily.rows, hourly: hourly.rows, features: features.rows, count: result.rows.length, calls: result.rows }, { headers: { "x-request-id": requestId } });
  } catch { return NextResponse.json({ ok: false, requestId, error: "DEBUG_KIS_CALLS_UNAVAILABLE" }, { status: 503, headers: { "x-request-id": requestId } }); }
}
