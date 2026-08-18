import fs from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/db";
import { inspectDatabaseSchema } from "@/lib/schema-health";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { FEATURE_MODULES, type FeatureModuleKey } from "@/lib/feature-modules";

type BuildInfo = { version?: string; commit?: string; builtAt?: string };

function summarizeAutomationMetrics(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const keys = ["instrumentCount", "processedCount", "totalCount", "successCount", "failureCount", "savedCandleCount", "durationMs", "durationSeconds", "sent", "skipped"];
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

export function getAutomationCoverage(registered: readonly string[], observed: readonly string[]) {
  const observedSet = new Set(observed);
  const expected = [...registered];
  const actual = expected.filter((moduleKey) => observedSet.has(moduleKey));
  return { expected, observed: actual, neverRun: expected.filter((moduleKey) => !observedSet.has(moduleKey)) };
}

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
  const optionalIntegrations = ["KIS_APPKEY", "KIS_APPSECRET", "ALPACA_API_KEY", "ALPACA_API_SECRET", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL", "US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "NEWS_RADAR_DISCORD_WEBHOOK_URL", "MARKET_RSS_DISCORD_WEBHOOK_URL", "SEC_DISCORD_WEBHOOK_URL", "AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL", "SEC_USER_AGENT", "ADMIN_DASHBOARD_PASSWORD"];
  const checks = { database: database.ok, databaseConnection: database.connected, schema: database.schemaReady, flyway: database.schemaReady && Boolean(database.flywayVersion), requiredEnv: requiredEnv.every((key) => Boolean(process.env[key]?.trim())) };
  let automation: Record<string, { status: string; startedAt: string | null; finishedAt: string | null; error: string | null; metrics: Record<string, unknown> }> = {};
  let automationCoverage: { expected: string[]; observed: string[]; neverRun: string[] } = { expected: [], observed: [], neverRun: [] };
  let cacheAutomation: Record<string, unknown> = {};
  if (database.connected && database.checkedTables.includes("automation_runs")) {
    try {
      const result = await getPool().query<{ module_key: string; status: string; started_at: Date; finished_at: Date | null; error_message: string | null; summary: unknown }>("SELECT DISTINCT ON (module_key) module_key, status, started_at, finished_at, error_message, summary FROM automation_runs ORDER BY module_key, started_at DESC");
      automation = Object.fromEntries(result.rows.map((row) => { const startedAt = row.started_at?.toISOString() ?? null; const finishedAt = row.finished_at?.toISOString() ?? null; const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null; return [row.module_key, { status: row.status, startedAt, finishedAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), error: row.error_message, metrics: summarizeAutomationMetrics(row.summary) }]; }));
      const expected = FEATURE_MODULES.filter((module) => module.scheduler === "OCI_CRON").map((module) => module.key);
      automationCoverage = getAutomationCoverage(expected, Object.keys(automation));
      const cacheModules = ["us-daily-cache", "us-daily-open-cache", "kr-daily-cache", "us-free-float", "us-product-classification"];
      const latest = await getPool().query<{ module_key: string; status: string; started_at: Date; finished_at: Date | null; error_message: string | null; summary: unknown }>("SELECT DISTINCT ON (module_key) module_key, status, started_at, finished_at, error_message, summary FROM automation_runs WHERE module_key = ANY($1) AND status <> 'SKIPPED' ORDER BY module_key, started_at DESC", [cacheModules]);
      const latestByModule = new Map(latest.rows.map((row) => [row.module_key, row]));
      for (const moduleKey of cacheModules) {
        const settings = await loadFeatureModuleSettings(moduleKey as FeatureModuleKey).catch(() => null);
        const row = latestByModule.get(moduleKey);
        // A completed run's freshness is measured from completion, not start.
        // Long-running cache jobs must not look stale while they are still finishing.
        const activityAt = row?.finished_at ?? row?.started_at ?? null;
        const activityAtMs = activityAt ? new Date(activityAt).getTime() : null;
        const ageSeconds = activityAtMs == null ? null : Math.max(0, Math.round((Date.now() - activityAtMs) / 1000));
        const intervalSeconds = settings?.intervalSeconds ?? null;
        const stale = Boolean(settings?.enabled && ageSeconds != null && intervalSeconds != null && ageSeconds > intervalSeconds * 2);
        const startedAt = row?.started_at?.toISOString() ?? null;
        const finishedAt = row?.finished_at?.toISOString() ?? null;
        const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null;
        cacheAutomation[moduleKey] = { enabled: settings?.enabled ?? null, intervalSeconds, status: row?.status ?? "NEVER_RUN", startedAt, finishedAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), ageSeconds, stale, error: row?.error_message ?? null, metrics: summarizeAutomationMetrics(row?.summary) };
      }
    } catch (error) { console.warn("[Health] automation status unavailable:", error instanceof Error ? error.message : error); }
  }
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    service: { name: "stockman", version: buildInfo().version, commit: buildInfo().commit, builtAt: buildInfo().builtAt, node: process.version, next: "15.5.15", uptimeSeconds: Math.floor(process.uptime()) },
    database,
    automation,
    automationCoverage,
    cacheAutomation,
    checks,
    environment: Object.fromEntries(optionalIntegrations.map((key) => [key, Boolean(process.env[key]?.trim())])),
  };
}
