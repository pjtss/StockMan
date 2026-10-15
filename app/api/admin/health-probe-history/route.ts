import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { describeError } from "@/lib/error-diagnostics";
import { getHealthProbeAlerts, type HealthProbeRecord } from "@/lib/health-probe-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await getPool().query<HealthProbeRecord>(
      `SELECT probe_name, duration_ms, ok, error_code, checked_at
       FROM health_probe_history
       WHERE checked_at >= NOW() - INTERVAL '24 hours'
       ORDER BY checked_at DESC
       LIMIT 1000`,
    );
    const records = result.rows;
    const summaries = [...new Set(records.map((row) => row.probe_name))].map((probeName) => {
      const values = records.filter((row) => row.probe_name === probeName);
      const durations = values.map((row) => row.duration_ms);
      return {
        probeName,
        sampleCount: values.length,
        failureCount: values.filter((row) => !row.ok).length,
        averageDurationMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
        maxDurationMs: Math.max(...durations),
        latest: values[0],
      };
    });
    return NextResponse.json({ ok: true, windowHours: 24, generatedAt: new Date().toISOString(), summaries, alerts: getHealthProbeAlerts(records), records: records.slice(0, 100) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, ...diagnostics }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
