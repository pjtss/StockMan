import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { FEATURE_MODULES } from "@/lib/feature-modules";
import { OPERATIONAL_SCHEMA_TABLES, RETIRED_SCHEMA_TABLES } from "@/lib/schema-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POOL_ACQUIRE_TIMEOUT_MS = 3_000;
const STATEMENT_TIMEOUT_MS = 1_500;
const CACHE_MODULES = ["us-daily-cache", "us-daily-open-cache", "kr-daily-cache"];
const AUTOMATION_MODULES = FEATURE_MODULES.map((module) => module.key);

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  if (error instanceof Error) return error.name;
  return "UNKNOWN_ERROR";
}

async function acquireClient(pool: ReturnType<typeof getPool>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = pool.connect();
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("POOL_ACQUIRE_TIMEOUT"), { code: "POOL_ACQUIRE_TIMEOUT" })), POOL_ACQUIRE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    void pending.then((client) => client.release()).catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const pool = getPool();
  const poolStats = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
  const startedAt = Date.now();
  let client: Awaited<ReturnType<typeof acquireClient>> | undefined;
  let inTransaction = false;
  const probes: Array<{ name: string; ok: boolean; durationMs: number; rowCount?: number; errorCode?: string }> = [];

  try {
    client = await acquireClient(pool);
    await client.query("BEGIN READ ONLY");
    inTransaction = true;
    await client.query("SELECT set_config('statement_timeout', $1, true)", [`${STATEMENT_TIMEOUT_MS}ms`]);

    const probe = async (name: string, text: string, values: unknown[] = []) => {
      const probeStartedAt = Date.now();
      await client!.query("SAVEPOINT health_probe");
      try {
        const result = await client!.query(text, values);
        await client!.query("RELEASE SAVEPOINT health_probe");
        probes.push({ name, ok: true, durationMs: Date.now() - probeStartedAt, rowCount: result.rowCount ?? result.rows.length });
      } catch (error) {
        await client!.query("ROLLBACK TO SAVEPOINT health_probe").catch(() => undefined);
        await client!.query("RELEASE SAVEPOINT health_probe").catch(() => undefined);
        probes.push({ name, ok: false, durationMs: Date.now() - probeStartedAt, errorCode: errorCode(error) });
      }
    };

    await probe("connection", "SELECT 1");
    await probe("operational_tables", "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])", [OPERATIONAL_SCHEMA_TABLES]);
    await probe("operational_columns", "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND (table_name, column_name) IN (($1, $2), ($3, $4))", ["kr_common_stock_universe", "daily_active", "us_common_stock_universe", "daily_active"]);
    await probe("retired_tables", "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])", [RETIRED_SCHEMA_TABLES]);
    await probe("latest_flyway", "SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1");
    await probe("automation_latest_by_module", "SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [AUTOMATION_MODULES]);
    await probe("cache_latest_by_module", "SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status <> 'SKIPPED' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [CACHE_MODULES]);
    await probe("cache_last_success_by_module", "SELECT requested.module_key, latest.finished_at FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.finished_at FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status = 'SUCCESS' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [CACHE_MODULES]);
    await probe("cache_feature_settings", "SELECT module_key, updated_at FROM feature_module_settings WHERE module_key = ANY($1::text[])", [CACHE_MODULES]);

    await client.query("ROLLBACK");
    inTransaction = false;
    const ok = probes.every((item) => item.ok);
    return NextResponse.json({ ok, checkedAt: new Date().toISOString(), responseTimeMs: Date.now() - startedAt, statementTimeoutMs: STATEMENT_TIMEOUT_MS, pool: poolStats, probes }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (client && inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, checkedAt: new Date().toISOString(), responseTimeMs: Date.now() - startedAt, pool: poolStats, probes, errorCode: errorCode(error) }, { status: 503, headers: { "cache-control": "no-store" } });
  } finally {
    client?.release();
  }
}
