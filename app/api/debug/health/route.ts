import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminSession } from "@/lib/admin-auth";
import { getHealthSnapshot } from "@/lib/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401, headers: { "x-request-id": requestId } });
  try {
    return NextResponse.json({ ok: true, requestId, ...(await getHealthSnapshot()) }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return NextResponse.json({ ok: false, requestId, error: error instanceof Error ? error.message : String(error) }, { status: 503, headers: { "x-request-id": requestId } });
  }
}
