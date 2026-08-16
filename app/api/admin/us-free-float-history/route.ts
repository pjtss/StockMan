import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret") || "";
  const cronAuthorized = Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);
  if (!cronAuthorized && !(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? 100) || 100));
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  try {
    const result = await getPool().query({
      text: `SELECT id, ticker, market, started_at, finished_at, status, source,
                    failure_reason, fmp_status, sec_status, saved
             FROM us_free_float_refresh_history
             ORDER BY finished_at DESC OFFSET $1 LIMIT $2`,
      values: [offset, limit],
    });
    return NextResponse.json({ ok: true, offset, limit, count: result.rows.length, rows: result.rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
