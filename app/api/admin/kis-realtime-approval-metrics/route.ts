import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminSession } from "@/lib/admin-auth";
import { getKisRealtimeApprovalRateLimitMetrics } from "@/lib/kis-realtime-approval-rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, requestId, metrics: getKisRealtimeApprovalRateLimitMetrics() }, { headers: { "cache-control": "no-store" } });
}
