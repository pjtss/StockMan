import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const pool = getPool();
    const result = await pool.query<{ issued_at: Date; expires_at: Date }>({
      text: "SELECT issued_at, expires_at FROM kis_tokens WHERE id = 1 LIMIT 1",
    });
    const history = await pool.query<{ issued_at: Date; expires_at: Date; reason: string }>({
      text: `
        SELECT issued_at, expires_at, reason
        FROM kis_token_issuance_history
        ORDER BY issued_at DESC
        LIMIT 20
      `,
    });
    const row = result.rows[0];
    const historyRows = history.rows.map((entry, index, rows) => {
      const issuedAt = new Date(entry.issued_at);
      const previous = rows[index + 1];
      const intervalSeconds = previous
        ? Math.max(0, Math.floor((issuedAt.getTime() - new Date(previous.issued_at).getTime()) / 1000))
        : null;
      return { issuedAt: issuedAt.toISOString(), expiresAt: new Date(entry.expires_at).toISOString(), reason: entry.reason, intervalSeconds };
    });
    const intervals = historyRows.map((entry) => entry.intervalSeconds).filter((value): value is number => value !== null);
    const issuanceStats = {
      historyCount: historyRows.length,
      averageIntervalSeconds: intervals.length ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) : null,
      minimumIntervalSeconds: intervals.length ? Math.min(...intervals) : null,
      maximumIntervalSeconds: intervals.length ? Math.max(...intervals) : null,
      recent: historyRows,
    };
    if (!row) return NextResponse.json({ ok: true, tokenPresent: false, issuanceStats, checkedAt: new Date().toISOString() });
    const issuedAt = new Date(row.issued_at);
    const expiresAt = new Date(row.expires_at);
    const remainingMs = expiresAt.getTime() - Date.now();
    return NextResponse.json({
      ok: true,
      tokenPresent: true,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      expired: remainingMs <= 0,
      issuancePolicy: "reuse_until_official_expiry; reissue only after expiry or explicit AUTH/401 refresh",
      issuanceStats,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
