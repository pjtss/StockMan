import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { syncUsExchangeStatuses } from "@/lib/us-exchange-status-sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncUsExchangeStatuses();
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "US_EXCHANGE_STATUS_SYNC_FAILED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
