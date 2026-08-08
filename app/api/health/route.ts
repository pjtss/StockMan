import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health-check";
import { resolveRequestId, withRequestTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  const snapshot = await getHealthSnapshot();
  const response = NextResponse.json({ ...snapshot, requestId }, { status: snapshot.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
  return withRequestTrace(response, requestId, startedAt);
}
