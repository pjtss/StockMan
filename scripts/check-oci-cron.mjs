import fs from "node:fs";
import path from "node:path";

const file = path.resolve("scripts/oci-cron.sh");
const source = fs.readFileSync(file, "utf8");
const matches = [...source.matchAll(/run_cron_endpoint\s+"([^"]+)"\s+(\d+)\s+"([^"]+)"/g)];
if (matches.length === 0) throw new Error("No cron endpoints were found");
if (!source.includes('run_cron_endpoint "db-retention" 60 "/api/cron/db-retention"')) {
  throw new Error("The bounded database retention job must run in the shared OCI cron pipeline");
}
const retentionRoute = fs.readFileSync(path.resolve("app/api/cron/db-retention/route.ts"), "utf8");
const healthProbeRoute = fs.readFileSync(path.resolve("app/api/cron/health-probe-snapshot/route.ts"), "utf8");
if (!healthProbeRoute.includes("DELETE FROM health_probe_history WHERE checked_at < NOW() - INTERVAL '14 days'")) {
  throw new Error("Health probe history must retain its existing 14-day cleanup path");
}
if (!retentionRoute.includes("const DELETE_BATCH_SIZE = 5_000")
  || !retentionRoute.includes("const MAX_BATCHES_PER_TABLE = 3")
  || !retentionRoute.includes("FOR UPDATE SKIP LOCKED")
  || !retentionRoute.includes("target.ctid = expired.ctid")
  || !retentionRoute.includes("failed[job.table] = code")
  || !retentionRoute.includes("status: ok ? 200 : 503")) {
  throw new Error("Database retention deletes must use bounded PostgreSQL batches");
}
const retentionSchemaRequirements = {
  kr_minute_candles: ["candle_date", "candle_time"], us_minute_candles: ["candle_date", "candle_time"],
  request_logs: ["created_at"], market_rss_fetch_snapshots: ["fetched_at"], market_rss_articles: ["source_snapshot_id"],
  sec_source_snapshots: ["source_type", "source_key", "fetched_at", "id"], kis_signal_snapshots: ["fetched_at"],
  discord_delivery_queue: ["status", "updated_at"], kr_minute_fetch_logs: ["fetched_at"], debug_kis_calls: ["observed_at"],
  debug_run_items: ["completed_at"], automation_runs: ["started_at"], kis_realtime_events: ["observed_at"],
  intraday_detection_transitions: ["observed_at", "tick_id"], intraday_detection_ticks: ["observed_at", "tick_id", "run_id"],
  intraday_detection_runs: ["finished_at", "run_id"], us_trade_intensity_ticks: ["fetched_at"],
  instrument_fundamental_history: ["fetched_at"], kis_rate_limit_events: ["occurred_at"],
  kis_token_issuance_history: ["issued_at"], market_rss_translation_cache: ["updated_at"],
  automation_notification_deliveries: ["delivery_date"], us_top_rising_snapshots: ["collected_at"],
  us_intraday_vwap_snapshots: ["observed_at"], instrument_universe_sync_runs: ["started_at"],
  instrument_candle_cache_failures: ["observed_at"], instrument_candle_cache_retries: ["status", "updated_at"],
  daily_bollinger_cache_retries: ["status", "updated_at"], daily_cache_followup_retries: ["status", "updated_at"],
  translation_usage_reservations: ["reserved_at"],
};
const migrationFiles = fs.readdirSync(path.resolve("db/migration"))
  .filter((name) => /^V\d+__.*\.sql$/i.test(name))
  .map((name) => ({ name, sql: fs.readFileSync(path.resolve("db/migration", name), "utf8") }));
const migrationSql = migrationFiles.map(({ sql }) => sql).join("\n");
const retentionMigrationConfig = fs.readFileSync(path.resolve("db/migration/V168__bounded_non_daily_data_retention.sql.conf"), "utf8");
const deployWorkflow = fs.readFileSync(path.resolve(".github/workflows/deploy-oci.yml"), "utf8");
const retentionMigration = migrationFiles.find(({ name }) => name === "V168__bounded_non_daily_data_retention.sql")?.sql ?? "";
if (!/^executeInTransaction=false\s*$/m.test(retentionMigrationConfig)
  || !/CREATE INDEX CONCURRENTLY IF NOT EXISTS/.test(retentionMigration)
  || /CREATE INDEX IF NOT EXISTS/.test(retentionMigration)
  || !deployWorkflow.includes('cp db/migration/*.sql.conf "$release_dir/db/migration/"')
  || !deployWorkflow.includes("./db/migration/V168__bounded_non_daily_data_retention.sql.conf")) {
  throw new Error("V168 concurrent indexes must run outside a Flyway transaction and ship with their script configuration");
}
for (const [table, columns] of Object.entries(retentionSchemaRequirements)) {
  const tablePattern = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+${table}\\s*\\(([\\s\\S]*?)\\);`, "i");
  const tableDefinition = migrationSql.match(tablePattern)?.[1];
  if (!tableDefinition) throw new Error(`No migration creates retention table ${table}`);
  for (const column of columns) {
    const columnPattern = new RegExp(`\\b${column}\\s+(?:TEXT|TIMESTAMPTZ|BIGSERIAL|BIGINT|INTEGER|NUMERIC|DOUBLE\\s+PRECISION|BOOLEAN|JSONB|UUID|DATE)\\b`, "i");
    const alteredColumnPattern = new RegExp(`ALTER TABLE\\s+${table}\\s+ADD COLUMN(?: IF NOT EXISTS)?\\s+${column}\\s+(?:TEXT|TIMESTAMPTZ|BIGSERIAL|BIGINT|INTEGER|NUMERIC|DOUBLE\\s+PRECISION|BOOLEAN|JSONB|UUID|DATE)\\b`, "i");
    if (!columnPattern.test(tableDefinition) && !alteredColumnPattern.test(migrationSql)) throw new Error(`No migration defines ${table}.${column}`);
  }
}
const indexSpecs = (sql) => [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF NOT EXISTS)?\s+[^\s]+\s+ON\s+([a-z_][a-z0-9_]*)\s*\(([^()]*)\)/gi)]
  .map(([, table, columns]) => ({
    table: table.toLowerCase(),
    columns: columns.split(",").map((column) => column.trim().replace(/\s+(?:ASC|DESC)(?:\s+NULLS\s+(?:FIRST|LAST))?$/i, "").replace(/\s+/g, " ").toLowerCase()).join(","),
  }));
const earlierIndexSpecs = indexSpecs(migrationFiles.filter(({ name }) => name !== "V168__bounded_non_daily_data_retention.sql").map(({ sql }) => sql).join("\n"));
for (const index of indexSpecs(retentionMigration)) {
  if (earlierIndexSpecs.some((existing) => existing.table === index.table && existing.columns === index.columns)) {
    throw new Error(`V168 adds a duplicate index on ${index.table} (${index.columns})`);
  }
}
for (const [table, interval] of [
  ["kr_minute_candles", "30 days"], ["us_minute_candles", "30 days"], ["request_logs", "30 days"],
  ["automation_runs", "90 days"], ["discord_delivery_queue", "30 days"], ["kis_signal_snapshots", "365 days"],
  ["instrument_fundamental_history", "90 days"], ["kis_rate_limit_events", "90 days"],
  ["market_rss_translation_cache", "180 days"], ["us_top_rising_snapshots", "30 days"],
  ["us_intraday_vwap_snapshots", "30 days"],
]) {
  const policyPattern = new RegExp(`batchedDelete\\(\\"${table}\\", [^\\n]*INTERVAL '${interval}'`);
  if (!policyPattern.test(retentionRoute)) throw new Error(`Database retention policy is missing or changed for ${table}`);
}
for (const dailyCandleTable of ["kr_daily_price_candles", "us_daily_price_candles", "kr_latest_daily_candles", "us_latest_daily_candles", "kr_instrument_universe_candles", "us_instrument_universe_candles"]) {
  if (retentionRoute.includes(`batchedDelete("${dailyCandleTable}"`) || retentionRoute.includes(`DELETE FROM ${dailyCandleTable}`)) {
    throw new Error(`Daily candle table ${dailyCandleTable} must be excluded from database retention cleanup`);
  }
}
if (!retentionRoute.includes("UPDATE market_rss_articles AS article SET source_snapshot_id = NULL")
  || !retentionRoute.includes("DELETE FROM market_rss_fetch_snapshots AS snapshot USING expired")
  || retentionRoute.includes("DELETE FROM market_rss_articles")) {
  throw new Error("RSS feed snapshot cleanup must detach article links while preserving article payloads");
}
if (!retentionRoute.includes("snapshot.source_type = 'SUBMISSIONS'")
  || !retentionRoute.includes("newer.source_type = snapshot.source_type")
  || !retentionRoute.includes("snapshot.source_type <> 'SUBMISSIONS'")
  || !retentionRoute.includes("snapshot.fetched_at < NOW() - INTERVAL '365 days'")
  || !retentionRoute.includes("snapshot.fetched_at < NOW() - INTERVAL '180 days'")) {
  throw new Error("SEC source snapshot cleanup must retain each issuer's latest submissions snapshot");
}
const sharedCronTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-cron.timer"), "utf8");
const sharedCronService = fs.readFileSync(path.resolve("deploy/oci/stockman-cron.service"), "utf8");
const activationScript = fs.readFileSync(path.resolve("deploy/oci/stockman-activate"), "utf8");
if (!/OnCalendar=\*:0\/5/.test(sharedCronTimer) || !/Persistent=true/.test(sharedCronTimer)
  || !sharedCronService.includes("scripts/oci-cron.sh")
  || !activationScript.includes("stockman-cron.timer")
  || !activationScript.includes("systemctl enable stockman-cron.timer")
  || !activationScript.includes("systemctl restart stockman-cron.timer")) {
  throw new Error("Database retention must be reachable from the persistent five-minute OCI cron timer after activation");
}
const obvSnapshotCall = 'run_cron_endpoint "us-obv-divergence-snapshot" 600 "/api/cron/us-obv-divergence-snapshot"';
if (!source.includes(obvSnapshotCall)
  || source.indexOf(obvSnapshotCall) < source.indexOf('run_cron_endpoint "us-daily-cache"')
  || !source.includes('US_OBV_REFRESH_MINUTES >= 18 * 60 + 10')) {
  throw new Error("US OBV divergence refresh must follow the US daily cache and run on weekdays after the New York settlement window");
}

const labels = new Set();
for (const [, label, timeout, endpoint] of matches) {
  if (labels.has(label)) throw new Error(`Duplicate cron label: ${label}`);
  labels.add(label);
  if (Number(timeout) < 1) throw new Error(`Invalid timeout for ${label}: ${timeout}`);
  if (!endpoint.startsWith("/api/cron/")) throw new Error(`Invalid cron endpoint for ${label}: ${endpoint}`);
}

const fundamentalsScript = fs.readFileSync(path.resolve("scripts/oci-fundamentals-cron.sh"), "utf8");
const fundamentalsService = fs.readFileSync(path.resolve("deploy/oci/stockman-fundamentals.service"), "utf8");
const fundamentalsTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-fundamentals.timer"), "utf8");
const nginx = fs.readFileSync(path.resolve("deploy/oci/nginx-stockman.conf"), "utf8");
const activation = fs.readFileSync(path.resolve("deploy/oci/stockman-activate"), "utf8");
const workflow = fs.readFileSync(path.resolve(".github/workflows/deploy-oci.yml"), "utf8");
const automationRuns = fs.readFileSync(path.resolve("lib/automation-run-repository.ts"), "utf8");
const rssTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-rss.timer"), "utf8");
const rssRoute = fs.readFileSync(path.resolve("app/api/cron/market-rss/route.ts"), "utf8");
const rssDiscordPolicy = fs.readFileSync(path.resolve("lib/market-rss-discord-policy.ts"), "utf8");
const rssTranslationGate = fs.readFileSync(path.resolve("lib/market-rss-notification-translation-gate.ts"), "utf8");
const secRssSource = fs.readFileSync(path.resolve("lib/sec-edgar-rss.ts"), "utf8");

if (source.includes("/api/cron/instrument-fundamentals")) {
  throw new Error("Instrument fundamentals must not run inline in the shared five-minute cron pipeline");
}
if (!fundamentalsScript.includes("/api/cron/instrument-fundamentals") || !/--max-time\s+15300/.test(fundamentalsScript)) {
  throw new Error("Dedicated fundamentals runner must call its endpoint with a timeout sized for measured full refreshes");
}
if (!/TimeoutStartSec=4h30min/.test(fundamentalsService) || !fundamentalsService.includes("oci-fundamentals-cron.sh")) {
  throw new Error("Dedicated fundamentals service must allow the measured long-run duration and call its own runner");
}
if (!/location\s*=\s*\/api\/cron\/instrument-fundamentals\s*\{[\s\S]*?proxy_read_timeout\s+4h25m;/.test(nginx) ||
    !nginx.includes("proxy_send_timeout 4h25m;")) {
  throw new Error("The fundamentals reverse-proxy route must outlive the client timeout without extending other routes");
}
if (!/OnCalendar=\*:0\/5/.test(fundamentalsTimer) || !/Persistent=true/.test(fundamentalsTimer)) {
  throw new Error("Dedicated fundamentals timer must poll the admin schedule and catch up after downtime");
}
for (const required of [
  "stockman-fundamentals.service",
  "stockman-fundamentals.timer",
  "enable stockman-fundamentals.timer",
  "restart stockman-fundamentals.timer",
  "start --no-block stockman-fundamentals.service",
]) {
  if (!activation.includes(required)) throw new Error(`Deployment activation is missing ${required}`);
}
if (!activation.includes('chmod +x "$TEMP_PATH/scripts/oci-fundamentals-cron.sh"')) {
  throw new Error("Deployment activation must make the dedicated fundamentals runner executable");
}
for (const required of ["oci-fundamentals-cron.sh", "stockman-fundamentals.service", "stockman-fundamentals.timer"]) {
  if (!workflow.includes(required)) throw new Error(`OCI release packaging is missing ${required}`);
}
if (!automationRuns.includes("FUNDAMENTALS_STALE_RUN_AFTER_SECONDS = 5 * 60 * 60") || !automationRuns.includes("module_key = 'instrument-fundamentals'")) {
  throw new Error("Long-running fundamentals executions must have a stale/active-run threshold above the service timeout");
}
if (!/OnUnitActiveSec=1min/.test(rssTimer) || !/Persistent=true/.test(rssTimer)) {
  throw new Error("RSS timer must poll every minute and catch up after downtime");
}
if (!/const MARKET_RSS_BATCH_SIZE = 20/.test(rssRoute)) {
  throw new Error("RSS application route must bound each translation and notification batch at 20 candidates");
}
for (const source of ['"GLOBENEWSWIRE"', '"STOCKTITAN"', '"SEC_EDGAR"']) {
  if (!rssRoute.includes(source)) throw new Error(`RSS cron is missing required source ${source}`);
}
if (!rssDiscordPolicy.includes('["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"]')) {
  throw new Error("RSS Discord delivery and retries must be scoped to GlobeNewswire, StockTitan, and SEC");
}
if (!rssTranslationGate.includes('eq(marketRssArticles.translationStatus, "TRANSLATED")') || !rssTranslationGate.includes('"already_in_target_language"')) {
  throw new Error("RSS Discord delivery must require a validated Korean translation or an already-Korean title");
}
if (!secRssSource.includes("action=getcurrent&count=100&output=atom") || /type=8-K/.test(secRssSource)) {
  throw new Error("SEC RSS must read Latest Filings without filtering by form type");
}
if (!rssRoute.includes("notifyPendingMarketRssArticles(notificationBatchSize)") || !rssRoute.includes("translatePendingMarketRssArticles(translationBatchSize)")) {
  throw new Error("RSS cron must process translation batches and send their translated articles during the same run");
}
if (!fs.readFileSync(path.resolve("app/api/cron/instrument-fundamentals/route.ts"), "utf8").includes("MAX_FUNDAMENTALS_RUNNING_SECONDS = 5 * 60 * 60")) {
  throw new Error("Cron route duplicate-run guard must cover the full dedicated service lifetime");
}
if ((automationRuns.match(/CASE WHEN module_key = 'instrument-fundamentals' THEN \$[23] ELSE \$[12] END/g) ?? []).length < 2 ||
    !automationRuns.includes("[moduleKey, STALE_RUN_AFTER_SECONDS, FUNDAMENTALS_STALE_RUN_AFTER_SECONDS]")) {
  throw new Error("Stale reconciliation and active-run detection must both use the module-specific timeout");
}

console.log(`OCI cron structure OK (${matches.length} shared endpoints + isolated long-running fundamentals timer)`);
