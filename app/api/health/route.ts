import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health-check";
import { resolveRequestId, withRequestTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

let lastLoggedFailure = "";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  let snapshot: Awaited<ReturnType<typeof getHealthSnapshot>> | null = null;
  try { snapshot = await getHealthSnapshot(); } catch { /* expose only an availability status publicly */ }
  if (snapshot?.status !== "ok") {
    const diagnostics = snapshot ? {
      checks: snapshot.checks,
      database: {
        connected: snapshot.database.connected,
        schemaReady: snapshot.database.schemaReady,
        flywayVersion: snapshot.database.flywayVersion,
        missingOperationalTables: snapshot.database.missingOperationalTables,
        missingOperationalViews: snapshot.database.missingOperationalViews,
        missingOperationalColumns: snapshot.database.missingOperationalColumns,
        operationalColumnShapeIssues: snapshot.database.operationalColumnShapeIssues,
        operationalPrimaryKeyIssues: snapshot.database.operationalPrimaryKeyIssues,
        operationalIndexIssues: snapshot.database.operationalIndexIssues,
        retiredTablesPresent: snapshot.database.retiredTablesPresent,
        error: snapshot.database.error,
      },
    } : { error: "health_snapshot_failed" };
    const fingerprint = JSON.stringify(diagnostics);
    if (fingerprint !== lastLoggedFailure) {
      console.error("[Health] readiness degraded", diagnostics);
      lastLoggedFailure = fingerprint;
    }
  } else {
    lastLoggedFailure = "";
  }
  const response = NextResponse.json(snapshot ? { status: snapshot.status, checkedAt: snapshot.checkedAt, responseTimeMs: snapshot.responseTimeMs, requestId } : { status: "degraded", checkedAt: new Date().toISOString(), responseTimeMs: Date.now() - startedAt, requestId }, { status: snapshot?.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
  return withRequestTrace(response, requestId, startedAt);
}
