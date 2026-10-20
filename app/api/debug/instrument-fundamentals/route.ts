import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadInstrumentFundamentalRefreshDebug } from "@/lib/instrument-fundamental-debug";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!isCronRequestAuthorized(request) && !(await requireAdminSession())) {
    return NextResponse.json({ ok: false, requestId, error: "UNAUTHORIZED" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  try {
    const diagnostics = await loadInstrumentFundamentalRefreshDebug();
    return NextResponse.json({ ok: true, mode: "INSTRUMENT_FUNDAMENTALS_REFRESH_DEBUG", requestId, checkedAt: new Date().toISOString(), ...diagnostics }, { headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch {
    return NextResponse.json({ ok: false, mode: "INSTRUMENT_FUNDAMENTALS_REFRESH_DEBUG", requestId, error: "FUNDAMENTALS_REFRESH_LEDGER_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  }
}
