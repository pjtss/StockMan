import { getPool } from "@/lib/db";

type BuildInfo = { version?: string; commit?: string; builtAt?: string };

function buildInfo(): BuildInfo {
  return {
    version: process.env.npm_package_version || "0.1.0",
    commit: process.env.STOCKMAN_BUILD_VERSION || "unknown",
    builtAt: process.env.STOCKMAN_BUILD_TIME || null || undefined,
  };
}

export async function getHealthSnapshot() {
  const startedAt = Date.now();
  let database: { ok: boolean; flywayVersion: string | null; latencyMs: number; error?: string } = { ok: false, flywayVersion: null, latencyMs: 0 };
  try {
    const dbStartedAt = Date.now();
    const result = await getPool().query<{ version: string }>("SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1");
    database = { ok: true, flywayVersion: result.rows[0]?.version || null, latencyMs: Date.now() - dbStartedAt };
  } catch (error) {
    console.error("[Health] database check failed:", error instanceof Error ? error.message : error);
    database = { ok: false, flywayVersion: null, latencyMs: 0, error: error instanceof Error ? error.message : "database check failed" };
  }

  const requiredEnv = ["DATABASE_URL", "CRON_SECRET"];
  const optionalIntegrations = ["KIS_APPKEY", "KIS_APPSECRET", "ALPACA_API_KEY", "ALPACA_API_SECRET"];
  const checks = { database: database.ok, flyway: database.ok && Boolean(database.flywayVersion), requiredEnv: requiredEnv.every((key) => Boolean(process.env[key]?.trim())) };
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    service: { name: "stockman", version: buildInfo().version, commit: buildInfo().commit, builtAt: buildInfo().builtAt, node: process.version, next: "15.5.15", uptimeSeconds: Math.floor(process.uptime()) },
    database: { ok: database.ok, flywayVersion: database.flywayVersion, latencyMs: database.latencyMs, error: database.ok ? undefined : "database check failed" },
    checks,
    environment: Object.fromEntries(optionalIntegrations.map((key) => [key, Boolean(process.env[key]?.trim())])),
  };
}
