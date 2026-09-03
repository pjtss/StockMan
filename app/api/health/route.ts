import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health-check";
import { resolveRequestId, withRequestTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  let snapshot: Awaited<ReturnType<typeof getHealthSnapshot>> | null = null;
  try { snapshot = await getHealthSnapshot(); } catch { /* expose only an availability status publicly */ }
  const response = NextResponse.json(snapshot ? { status: snapshot.status, checkedAt: snapshot.checkedAt, responseTimeMs: snapshot.responseTimeMs, requestId } : { status: "degraded", checkedAt: new Date().toISOString(), responseTimeMs: Date.now() - startedAt, requestId }, { status: snapshot?.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
  return withRequestTrace(response, requestId, startedAt);
}
