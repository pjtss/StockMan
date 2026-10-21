import fs from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/db";
import { inspectDatabaseSchema, type SchemaHealth } from "@/lib/schema-health";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { FEATURE_MODULES, type FeatureModuleKey } from "@/lib/feature-modules";
import { getMarketRssTranslationConfiguration } from "@/lib/market-rss-translation-configuration";
import { getMarketRssTranslationProviders } from "@/lib/market-rss-translation-client";
import nextPackage from "next/package.json";

type BuildInfo = { version?: string; commit?: string; builtAt?: string };

export function getRuntimeVersions() {
  return { node: process.version, next: nextPackage.version };
}

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

export function summarizeDatabaseHealth(schema: SchemaHealth) {
  return {
    ok: schema.connectionOk && schema.schemaReady,
    connected: schema.connectionOk,
    schemaReady: schema.schemaReady,
    flywayVersion: schema.flywayVersion,
    checkedTables: schema.checkedTables,
    missingTables: schema.missingTables,
    operationalTables: schema.operationalTables,
    missingOperationalTables: schema.missingOperationalTables,
    missingOperationalColumns: schema.missingOperationalColumns,
    retiredTablesPresent: schema.retiredTablesPresent,
    latencyMs: schema.latencyMs,
    error: schema.error,
  };
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
  const runtimeVersions = getRuntimeVersions();
  const schema = await inspectDatabaseSchema();
  const database = summarizeDatabaseHealth(schema);

  const requiredEnv = ["DATABASE_URL", "CRON_SECRET"];
  const optionalIntegrations = ["KIS_APPKEY", "KIS_APPSECRET", "ALPACA_API_KEY", "ALPACA_API_SECRET", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL", "US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL", "NEWS_RADAR_DISCORD_WEBHOOK_URL", "MARKET_RSS_DISCORD_WEBHOOK_URL", "SEC_DISCORD_WEBHOOK_URL", "AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL", "SEC_USER_AGENT", "ADMIN_DASHBOARD_PASSWORD"];
  const providersConfigured = getMarketRssTranslationProviders();
  const rssTranslation = getMarketRssTranslationConfiguration(true, Boolean(providersConfigured.azure || providersConfigured.google), { azure: Boolean(providersConfigured.azure), google: Boolean(providersConfigured.google), primary: providersConfigured.azure ? "azure-translator" : providersConfigured.google ? "google-cloud-translation" : null });
  const checks = { database: database.ok, databaseConnection: database.connected, schema: database.schemaReady, flyway: database.schemaReady && Boolean(database.flywayVersion), requiredEnv: requiredEnv.every((key) => Boolean(process.env[key]?.trim())) };
  let automation: Record<string, { status: string; startedAt: string | null; finishedAt: string | null; error: string | null; metrics: Record<string, unknown> }> = {};
  let automationHistoryAvailable = false;
  let automationCoverage: { expected: string[]; observed: string[]; neverRun: string[] } = { expected: [], observed: [], neverRun: [] };
  let cacheAutomation: Record<string, unknown> = {};
  if (database.connected && database.checkedTables.includes("automation_runs")) {
    const pool = getPool();
    const expected = FEATURE_MODULES.filter((module) => module.scheduler === "OCI_CRON").map((module) => module.key);
    const cacheModules = ["us-daily-cache", "us-daily-open-cache", "kr-daily-cache"];
    const moduleKeys = FEATURE_MODULES.map((module) => module.key);
    const querySafely = async <T extends import("pg").QueryResultRow>(name: string, query: string, values: unknown[]) => {
      try { return await pool.query<T>(query, values); }
      catch (error) {
        console.warn(`[Health] ${name} unavailable:`, error instanceof Error ? error.message : error);
        return null;
      }
    };
    const [latestAutomation, latest, latestSuccess, cacheSettings] = await Promise.all([
      querySafely<{ module_key: string; status: string | null; started_at: Date | null; finished_at: Date | null; error_message: string | null; summary: unknown }>("automation history", "SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [moduleKeys]),
      querySafely<{ module_key: string; status: string | null; started_at: Date | null; finished_at: Date | null; error_message: string | null; summary: unknown }>("cache latest history", "SELECT requested.module_key, latest.status, latest.started_at, latest.finished_at, latest.error_message, latest.summary FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.status, history.started_at, history.finished_at, history.error_message, history.summary FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status <> 'SKIPPED' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [cacheModules]),
      querySafely<{ module_key: string; finished_at: Date | null }>("cache success history", "SELECT requested.module_key, latest.finished_at FROM unnest($1::text[]) WITH ORDINALITY AS requested(module_key, ordinal) LEFT JOIN LATERAL (SELECT history.finished_at FROM automation_runs AS history WHERE history.module_key = requested.module_key AND history.status = 'SUCCESS' ORDER BY history.started_at DESC LIMIT 1) AS latest ON TRUE ORDER BY requested.ordinal", [cacheModules]),
      Promise.all(cacheModules.map(async (moduleKey) => [moduleKey, await loadFeatureModuleSettings(moduleKey as FeatureModuleKey).catch(() => null)] as const)),
    ]);
    automationHistoryAvailable = latestAutomation !== null;
    if (latestAutomation) {
      automation = Object.fromEntries(latestAutomation.rows.filter((row) => row.status != null).map((row) => { const startedAt = row.started_at?.toISOString() ?? null; const finishedAt = row.finished_at?.toISOString() ?? null; const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null; return [row.module_key, { status: row.status!, startedAt, finishedAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), error: row.error_message, metrics: summarizeAutomationMetrics(row.summary) }]; }));
      automationCoverage = getAutomationCoverage(expected, Object.keys(automation));
    } else {
      automationCoverage = { expected, observed: [], neverRun: [] };
    }
    const latestByModule = new Map((latest?.rows ?? []).map((row) => [row.module_key, row]));
    const successByModule = new Map((latestSuccess?.rows ?? []).map((row) => [row.module_key, row]));
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
      const staleReason = !latest
        ? "history_unavailable"
        : !settings?.enabled
          ? "disabled"
          : !row
            ? "never_run"
            : row.status === "FAILED"
              ? "last_run_failed"
              : ageSeconds != null && intervalSeconds != null && ageSeconds > intervalSeconds * 2
                ? "interval_exceeded"
                : null;
      const stale = Boolean(staleReason && staleReason !== "disabled" && staleReason !== "history_unavailable");
      const startedAt = row?.started_at?.toISOString() ?? null;
      const finishedAt = row?.finished_at?.toISOString() ?? null;
      const durationMs = startedAt && finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null;
      cacheAutomation[moduleKey] = { enabled: settings?.enabled ?? null, intervalSeconds, historyAvailable: latest !== null, lastSuccessAvailable: latestSuccess !== null, status: row?.status ?? (latest ? "NEVER_RUN" : "UNAVAILABLE"), startedAt, finishedAt, lastSuccessAt, durationMs, durationSeconds: durationMs == null ? null : Number((durationMs / 1000).toFixed(2)), ageSeconds, stale, staleReason, error: row?.error_message ?? null, metrics: summarizeAutomationMetrics(row?.summary) };
    }
  }
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    service: { name: "stockman", version: buildInfo().version, commit: buildInfo().commit, builtAt: buildInfo().builtAt, ...runtimeVersions, uptimeSeconds: Math.floor(process.uptime()) },
    database,
    automation,
    automationHistoryAvailable,
    automationCoverage,
    cacheAutomation,
    rssTranslation,
    checks,
    environment: Object.fromEntries(optionalIntegrations.map((key) => [key, Boolean(process.env[key]?.trim())])),
  };
}
