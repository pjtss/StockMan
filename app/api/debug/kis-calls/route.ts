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
  try {
    const result = await getPool().query(`SELECT id, request_id, feature, market, code, timeframe, endpoint, tr_id, http_status, failure, attempt_count, duration_ms, retryable, observed_at FROM debug_kis_calls ORDER BY observed_at DESC LIMIT $1`, [limit]);
    return NextResponse.json({ ok: true, requestId, generatedAt: new Date().toISOString(), count: result.rows.length, calls: result.rows }, { headers: { "x-request-id": requestId } });
  } catch { return NextResponse.json({ ok: false, requestId, error: "DEBUG_KIS_CALLS_UNAVAILABLE" }, { status: 503, headers: { "x-request-id": requestId } }); }
}
