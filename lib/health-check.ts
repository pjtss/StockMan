import fs from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/db";
import { inspectDatabaseSchema } from "@/lib/schema-health";

type BuildInfo = { version?: string; commit?: string; builtAt?: string };

function buildInfo(): BuildInfo {
  try {
    const file = path.join(process.cwd(), "build-info.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BuildInfo;
    return {
      version: parsed.version || process.env.npm_package_version || "0.1.0",
      commit: parsed.commit || process.env.STOCKMAN_BUILD_VERSION || "unknown",
      builtAt: parsed.builtAt || process.env.STOCKMAN_BUILD_TIME || undefined,
    };
  } catch {
    // Local development may not have a CI build-info file yet.
  }
  return {
    version: process.env.npm_package_version || "0.1.0",
    commit: process.env.STOCKMAN_BUILD_VERSION || "unknown",
    builtAt: process.env.STOCKMAN_BUILD_TIME || null || undefined,
  };
}

export async function getHealthSnapshot() {
  const startedAt = Date.now();
  const schema = await inspectDatabaseSchema();
  const database = {
    ok: schema.connectionOk && schema.schemaReady,
    connected: schema.connectionOk,
    schemaReady: schema.schemaReady,
    flywayVersion: schema.flywayVersion,
    checkedTables: schema.checkedTables,
    missingTables: schema.missingTables,
    latencyMs: schema.latencyMs,
    error: schema.error,
  };

  const requiredEnv = ["DATABASE_URL", "CRON_SECRET"];
  const optionalIntegrations = ["KIS_APPKEY", "KIS_APPSECRET", "ALPACA_API_KEY", "ALPACA_API_SECRET", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL", "US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "NEWS_RADAR_DISCORD_WEBHOOK_URL", "MARKET_RSS_DISCORD_WEBHOOK_URL", "SEC_DISCORD_WEBHOOK_URL", "SEC_USER_AGENT", "ADMIN_DASHBOARD_PASSWORD"];
  const checks = { database: database.ok, databaseConnection: database.connected, schema: database.schemaReady, flyway: database.schemaReady && Boolean(database.flywayVersion), requiredEnv: requiredEnv.every((key) => Boolean(process.env[key]?.trim())) };
  let automation: Record<string, { status: string; startedAt: string | null; finishedAt: string | null; error: string | null }> = {};
  if (database.connected && database.checkedTables.includes("automation_runs")) {
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
    database,
    automation,
    checks,
    environment: Object.fromEntries(optionalIntegrations.map((key) => [key, Boolean(process.env[key]?.trim())])),
  };
}
