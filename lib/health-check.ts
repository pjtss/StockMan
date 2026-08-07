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
  const optionalIntegrations = ["KIS_APPKEY", "KIS_APPSECRET", "ALPACA_API_KEY", "ALPACA_API_SECRET", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL", "NEWS_RADAR_DISCORD_WEBHOOK_URL", "MARKET_RSS_DISCORD_WEBHOOK_URL", "OBV_DISCORD_WEBHOOK_URL"];
  const checks = { database: database.ok, flyway: database.ok && Boolean(database.flywayVersion), requiredEnv: requiredEnv.every((key) => Boolean(process.env[key]?.trim())) };
  let automation: Record<string, { status: string; startedAt: string | null; finishedAt: string | null; error: string | null }> = {};
  if (database.ok) {
    try {
      const result = await getPool().query<{ module_key: string; status: string; started_at: Date; finished_at: Date | null; error_message: string | null }>("SELECT DISTINCT ON (module_key) module_key, status, started_at, finished_at, error_message FROM automation_runs ORDER BY module_key, started_at DESC");
      automation = Object.fromEntries(result.rows.map((row) => [row.module_key, { status: row.status, startedAt: row.started_at?.toISOString() ?? null, finishedAt: row.finished_at?.toISOString() ?? null, error: row.error_message }]));
    } catch (error) { console.warn("[Health] automation status unavailable:", error instanceof Error ? error.message : error); }
  }
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    service: { name: "stockman", version: buildInfo().version, commit: buildInfo().commit, builtAt: buildInfo().builtAt, node: process.version, next: "15.5.15", uptimeSeconds: Math.floor(process.uptime()) },
    database: { ok: database.ok, flywayVersion: database.flywayVersion, latencyMs: database.latencyMs, error: database.ok ? undefined : "database check failed" },
    automation,
    checks,
    environment: Object.fromEntries(optionalIntegrations.map((key) => [key, Boolean(process.env[key]?.trim())])),
  };
}
