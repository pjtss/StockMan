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
  const result = await getPool().query(`SELECT * FROM (
    SELECT 'automation' AS source, module_key AS key, status, started_at AS observed_at, error_message AS message, summary->'diagnostics' AS diagnostics
      FROM automation_runs WHERE status IN ('FAILED','RUNNING') AND (error_message IS NOT NULL OR status = 'RUNNING')
    UNION ALL
    SELECT 'candle' AS source, market || ':' || code || ':' || timeframe AS key, 'FAILED' AS status, observed_at, error AS message, NULL::jsonb AS diagnostics
      FROM instrument_candle_cache_failures
  ) errors ORDER BY observed_at DESC LIMIT $1`, [limit]);
  return NextResponse.json({ ok: true, requestId, generatedAt: new Date().toISOString(), count: result.rows.length, errors: result.rows }, { headers: { "x-request-id": requestId } });
}
