import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { getPool } from "@/lib/db";
import { describeError } from "@/lib/error-diagnostics";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const maxDuration = 30;

type Probe = { name: string; sql: string; values?: unknown[]; validate?: (rows: Array<Record<string, unknown>>) => boolean };
const PROBES: Probe[] = [
  { name: "db_connection", sql: "SELECT 1" },
  { name: "automation_history_latest", sql: "SELECT module_key, status, started_at FROM automation_runs WHERE module_key = 'kr-daily-cache' ORDER BY started_at DESC LIMIT 1" },
  { name: "health_schema", sql: "SELECT to_regclass('public.health_probe_history') IS NOT NULL AS ready", validate: (rows) => rows[0]?.ready === true },
];

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const pool = getPool();
  const requestId = request.headers.get("x-request-id")?.replace(/[^a-zA-Z0-9:_.-]/g, "").slice(0, 160) || null;
  const rows: Array<{ name: string; durationMs: number; ok: boolean; errorCode: string | null }> = [];
  for (const probe of PROBES) {
    const startedAt = Date.now();
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '2000ms'");
      const result = await client.query<Record<string, unknown>>(probe.sql, probe.values);
      const passed = !probe.validate || probe.validate(result.rows as Array<Record<string, unknown>>);
      await client.query("ROLLBACK");
      rows.push({ name: probe.name, durationMs: Date.now() - startedAt, ok: passed, errorCode: passed ? null : "SCHEMA_NOT_READY" });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      const diagnostics = describeError(error);
      rows.push({ name: probe.name, durationMs: Date.now() - startedAt, ok: false, errorCode: diagnostics.databaseCode || diagnostics.errorCode });
    } finally {
      client?.release();
    }
  }

  try {
    const values: unknown[] = [];
    const tuples = rows.map((row, index) => {
      const offset = index * 5;
      values.push(row.name, row.durationMs, row.ok, row.errorCode, requestId);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });
    await pool.query(`INSERT INTO health_probe_history (probe_name, duration_ms, ok, error_code, request_id) VALUES ${tuples.join(", ")}` , values);
    await pool.query("DELETE FROM health_probe_history WHERE checked_at < NOW() - INTERVAL '14 days'");
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: "persist", ...diagnostics, probes: rows }, { status: 503 });
  }

  const ok = rows.every((row) => row.ok);
  return NextResponse.json({ ok, recorded: rows.length, probes: rows, checkedAt: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
