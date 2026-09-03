import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401, headers: { "x-request-id": requestId } });
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const moduleKey = url.searchParams.get("moduleKey")?.trim();
  const params: unknown[] = [];
  const where = moduleKey ? "WHERE module_key = $1" : "";
  if (moduleKey) params.push(moduleKey);
  params.push(limit);
  try {
    const result = await getPool().query(`SELECT id, module_key, status, started_at, finished_at, duration_ms, job_type, market, timeframe, trigger_type, retry_count, summary, error_message FROM automation_runs ${where} ORDER BY started_at DESC LIMIT $${params.length}`, params);
    return NextResponse.json({ ok: true, requestId, generatedAt: new Date().toISOString(), count: result.rows.length, runs: result.rows });
  } catch {
    return NextResponse.json({ ok: false, requestId, error: "DEBUG_RUNS_UNAVAILABLE" }, { status: 503, headers: { "x-request-id": requestId } });
  }
}
