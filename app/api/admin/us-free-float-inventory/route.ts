import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret") || "";
  const cronAuthorized = Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);
  if (!cronAuthorized && !(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? 100) || 100));
  try {
    const pool = getPool();
    const result = await pool.query({
      text: `SELECT i.market, i.code, i.name,
                    s.source, s.as_of, s.fetched_at, s.float_shares,
                    s.outstanding_shares, s.free_float_percent,
                    d.failure_reason, d.fmp_status, d.fmp_error,
                    d.sec_status, d.sec_error, d.attempted_at
             FROM us_instruments i
             LEFT JOIN LATERAL (
               SELECT source, as_of, fetched_at, float_shares,
                      outstanding_shares, free_float_percent
               FROM us_free_float_snapshots x
               WHERE x.ticker = i.code
               ORDER BY fetched_at DESC
               LIMIT 1
             ) s ON TRUE
             LEFT JOIN us_free_float_diagnostics d ON d.ticker = i.code
             WHERE i.enabled = TRUE
             ORDER BY i.market, i.code
             OFFSET $1 LIMIT $2`,
      values: [offset, limit],
    });
    return NextResponse.json({ ok: true, offset, limit, count: result.rows.length, rows: result.rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
