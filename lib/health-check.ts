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
      const pool = getPool();
      const expected = FEATURE_MODULES.filter((module) => module.scheduler === "OCI_CRON").map((module) => module.key);
      const cacheModules = ["us-daily-cache", "us-daily-open-cache", "kr-daily-cache"];
      const moduleKeys = FEATURE_MODULES.map((module) => module.key);
      const [latestAutomation, latest, latestSuccess, cacheSettings] = await Promise.all([
        pool.query<{ module_key: string; status: string | null; started_at: Date | null; finished_at: Date | null; error_message: string | null; summary: unknown }>("SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [moduleKeys]),
        pool.query<{ module_key: string; status: string | null; started_at: Date | null; finished_at: Date | null; error_message: string | null; summary: unknown }>("SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status <> 'SKIPPED' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [cacheModules]),
        pool.query<{ module_key: string; finished_at: Date | null }>("SELECT requested.module_key, latest.finished_at FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.finished_at FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status = 'SUCCESS' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [cacheModules]),
        Promise.all(cacheModules.map(async (moduleKey) => [moduleKey, await loadFeatureModuleSettings(moduleKey as FeatureModuleKey).catch(() => null)] as const)),
      ]);
      automation = Object.fromEntries(latestAutomation.rows.filter((row) => row.status != null).map((row) => { const startedAt = row.started_at?.toISOString() ?? null; const finishedAt = row.finished_at?.toISOString() ?? null; const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null; return [row.module_key, { status: row.status!, startedAt, finishedAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), error: row.error_message, metrics: summarizeAutomationMetrics(row.summary) }]; }));
      automationCoverage = getAutomationCoverage(expected, Object.keys(automation));
      const latestByModule = new Map(latest.rows.map((row) => [row.module_key, row]));
      const successByModule = new Map(latestSuccess.rows.map((row) => [row.module_key, row]));
      const settingsByModule = new Map(cacheSettings);
      for (const moduleKey of cacheModules) {
        const settings = settingsByModule.get(moduleKey);
        const latestRow = latestByModule.get(moduleKey);
        const row = latestRow?.status == null ? undefined : latestRow;
        // A completed run's freshness is measured from completion, not start.
        // Long-running cache jobs must not look stale while they are still finishing.
        const activityAt = row?.finished_at ?? row?.started_at ?? null;
        const activityAtMs = activityAt ? new Date(activityAt).getTime() : null;
        const ageSeconds = activityAtMs == null ? null : Math.max(0, Math.round((Date.now() - activityAtMs) / 1000));
        const intervalSeconds = settings?.intervalSeconds ?? null;
        const lastSuccessAt = successByModule.get(moduleKey)?.finished_at?.toISOString() ?? null;
        const staleReason = !settings?.enabled
          ? "disabled"
          : !row
            ? "never_run"
            : row.status === "FAILED"
              ? "last_run_failed"
              : ageSeconds != null && intervalSeconds != null && ageSeconds > intervalSeconds * 2
                ? "interval_exceeded"
                : null;
        const stale = Boolean(staleReason && staleReason !== "disabled");
        const startedAt = row?.started_at?.toISOString() ?? null;
        const finishedAt = row?.finished_at?.toISOString() ?? null;
        const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null;
        cacheAutomation[moduleKey] = { enabled: settings?.enabled ?? null, intervalSeconds, status: row?.status ?? "NEVER_RUN", startedAt, finishedAt, lastSuccessAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), ageSeconds, stale, staleReason, error: row?.error_message ?? null, metrics: summarizeAutomationMetrics(row?.summary) };
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
