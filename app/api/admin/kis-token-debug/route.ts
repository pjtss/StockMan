import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await getPool().query<{ issued_at: Date; expires_at: Date }>({
      text: "SELECT issued_at, expires_at FROM kis_tokens WHERE id = 1 LIMIT 1",
    });
    const row = result.rows[0];
    if (!row) return NextResponse.json({ ok: true, tokenPresent: false, checkedAt: new Date().toISOString() });
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
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
