import fs from "node:fs";
import path from "node:path";

const file = path.resolve("scripts/oci-cron.sh");
const source = fs.readFileSync(file, "utf8");
const dailyCacheSyncSource = fs.readFileSync(path.resolve("scripts/sync-daily-cache-from-remote.mjs"), "utf8");
const asyncDailyCacheSyncSource = fs.readFileSync(path.resolve("scripts/sync-daily-cache-async.mjs"), "utf8");
const dailyCandleFallbackSource = fs.readFileSync(path.resolve("lib/daily-candle-fallback.mjs"), "utf8");
const dailyCacheSyncResultSource = fs.readFileSync(path.resolve("lib/daily-cache-sync-result.mjs"), "utf8");
const deploymentVerifierSource = fs.readFileSync(path.resolve("scripts/verify-deploy.mjs"), "utf8");
const apiUrlInitialization = dailyCacheSyncSource.match(/function createDailyCacheApiUrl\([\s\S]*?\n\}/)?.[0] ?? "";
const poolInitialization = dailyCacheSyncSource.match(/let pool;\s*let poolBackgroundErrorCount = 0;\s*let firstPoolBackgroundError;\s*try \{\s*pool = new Pool\(\{ connectionString: localDatabaseUrl, connectionTimeoutMillis: databaseConnectionTimeoutMs \}\);\s*\}\s*catch \{\s*throw new Error\("LOCAL_DATABASE_URL could not initialize PostgreSQL pool"\);\s*\}/)?.[0] ?? "";
const summarizeErrorSource = dailyCacheSyncSource.match(/function summarizeError\([\s\S]*?\n\}/)?.[0] ?? "";
const summaryTryPosition = summarizeErrorSource.indexOf("  try {");
const summaryCatchPosition = summarizeErrorSource.indexOf("  } catch {");
const summaryFallbackPosition = summarizeErrorSource.indexOf('return { name: "ErrorSummaryFailed", message: "error details unavailable" }');
const aggregateArrayCheckPosition = summarizeErrorSource.indexOf("if (!Array.isArray(aggregateErrors))");
const aggregateArrayReadPosition = summarizeErrorSource.indexOf("const aggregateErrors = error.errors;");
const aggregateSlicePosition = summarizeErrorSource.indexOf("aggregateErrors.slice(0, 20)");
const sanitizeErrorMessageSource = dailyCacheSyncSource.match(/function sanitizeErrorMessage\([\s\S]*?\n\}/)?.[0] ?? "";
const fundamentalsItemValidation = dailyCacheSyncSource.match(/for \(const item of fundamentalsPayload\.items\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
const fundamentalsNumericValidation = dailyCacheSyncSource.match(/const fundamentalNumericFields = \[([\s\S]*?)\];([\s\S]*?)returnedFundamentalCodes\.add\(code\);/)?.[0] ?? "";
const fundamentalsMetadataValidation = dailyCacheSyncSource.match(/if \(typeof item\.name !== "string"\)[\s\S]*?returnedFundamentalCodes\.add\(code\);/)?.[0] ?? "";
const redactionRules = [
  String.raw`postgres(?:ql)?|https?`,
  String.raw`[^/\s@]*@`,
  String.raw`password|passwd|pwd|token|access[_-]?token`,
  String.raw`(?:api|app)[_-]?key`,
  String.raw`(?:app|client)[_-]?secret`,
  String.raw`secret(?:key)?`,
  String.raw`authorization|credential|signature|sig`,
  String.raw`Bearer\s+`,
  String.raw`\s*[:=]\s*`,
  "<redacted>",
];
if (!summarizeErrorSource || !sanitizeErrorMessageSource || redactionRules.some((rule) => !sanitizeErrorMessageSource.includes(rule))) {
  throw new Error("Daily-cache sync error summaries must redact URI userinfo and sensitive query credentials");
}
if (!summarizeErrorSource.includes("sanitizeErrorMessage(error.message)")
  || !summarizeErrorSource.includes("sanitizeErrorMessage(error)")
  || !summarizeErrorSource.includes("sanitizeErrorMessage(error.name).slice(0, 100)")
  || !summarizeErrorSource.includes("Array.isArray(aggregateErrors)")
  || !summarizeErrorSource.includes("aggregateErrors.slice(0, 20)")
  || !summarizeErrorSource.includes("summary.errorsOmitted = aggregateErrors.length - summary.errors.length")
  || !summarizeErrorSource.includes("summary.errorsUnavailable = true")
  || !summarizeErrorSource.includes("error details unavailable")
  || !sanitizeErrorMessageSource.includes(".slice(0, 500)")) {
  throw new Error("Daily-cache sync must sanitize and bound error messages, names, and AggregateError width");
}
if (summaryTryPosition < 0 || summaryCatchPosition <= summaryTryPosition || summaryFallbackPosition <= summaryCatchPosition
  || aggregateArrayReadPosition < 0 || aggregateArrayCheckPosition <= aggregateArrayReadPosition
  || aggregateSlicePosition <= aggregateArrayCheckPosition) {
  throw new Error("Daily-cache sync must guard error-property access and AggregateError array use in execution order");
}
if (!dailyCacheSyncSource.includes('fatalFailure = { phase: "run", error: summarizeError(error).message }')
  || !dailyCacheSyncSource.includes('poolShutdownFailure = { phase: "pool-shutdown", error: summarizeError(error).message }')) {
  throw new Error("Daily-cache sync top-level and pool-shutdown failures must use sanitized error summaries");
}
if (!apiUrlInitialization.includes('new URL("/api/public/daily-candles", normalizedBaseUrl)')
  || !apiUrlInitialization.includes("String(baseUrl).trim()")
  || !apiUrlInitialization.includes('["http:", "https:"]')
  || !apiUrlInitialization.includes("url.username || url.password")
  || !apiUrlInitialization.includes("rawAuthority.includes(\"@\")")
  || !apiUrlInitialization.includes('authority.includes("@")')
  || !apiUrlInitialization.includes("catch {")
  || !apiUrlInitialization.includes("DAILY_CACHE_API_URL must be a valid absolute HTTP(S) URL without credentials")) {
  throw new Error("Daily-cache sync must validate a credential-free public API URL without exposing its configured value");
}
const apiInitializationPosition = dailyCacheSyncSource.indexOf("const api = createDailyCacheApiUrl(");
const poolInitializationPosition = dailyCacheSyncSource.indexOf("pool = new Pool(");
if (apiInitializationPosition < 0 || poolInitializationPosition < 0 || apiInitializationPosition > poolInitializationPosition) {
  throw new Error("Daily-cache sync must validate the API URL before creating the local database pool");
}
if (!poolInitialization) {
  throw new Error("Daily-cache sync must convert synchronous pool initialization failures to a secret-free error");
}
if (!dailyCacheSyncSource.includes("const localDatabaseUrl = process.env.LOCAL_DATABASE_URL?.trim();")
  || !dailyCacheSyncSource.includes("const dailyCacheApiBaseUrl = process.env.DAILY_CACHE_API_URL?.trim();")
  || !dailyCacheSyncSource.includes("const api = createDailyCacheApiUrl(dailyCacheApiBaseUrl);")
  || !dailyCacheSyncSource.includes('new URL("/api/public/instrument-fundamentals", dailyCacheApiBaseUrl)')) {
  throw new Error("Daily-cache sync must trim and consistently use validated environment URLs");
}
const asyncApiUrlValidation = asyncDailyCacheSyncSource.match(/function validateDailyCacheApiBaseUrl\(value\) \{[\s\S]*?\n\}/)?.[0] ?? "";
if (!asyncApiUrlValidation.includes("value.match(/^https?:\\/\\/([^/?#]*)/i)")
  || !asyncApiUrlValidation.includes('["http:", "https:"]')
  || !asyncApiUrlValidation.includes("url.username")
  || !asyncApiUrlValidation.includes("url.password")
  || !asyncApiUrlValidation.includes("rawAuthority.includes(\"@\")")
  || !asyncDailyCacheSyncSource.includes("const dailyCacheApiBaseUrl = process.env.DAILY_CACHE_API_URL?.trim();")
  || !asyncDailyCacheSyncSource.includes("const validatedDailyCacheApiBaseUrl = dailyCacheApiBaseUrl ? validateDailyCacheApiBaseUrl(dailyCacheApiBaseUrl) : null;")) {
  throw new Error("Async daily-cache sync must trim and validate a credential-free HTTP(S) base URL");
}
for (const line of asyncDailyCacheSyncSource.split("\n")) {
  if (/new URL\([^\n]*process\.env\.DAILY_CACHE_API_URL/.test(line)) {
    throw new Error("Async daily-cache endpoints must use the validated base URL");
  }
}
if (!asyncDailyCacheSyncSource.includes("async function persistParts(kind, parts)")
  || !asyncDailyCacheSyncSource.includes("persistParts(kind, job.parts)")
  || !asyncDailyCacheSyncSource.includes("refreshDailyCandleSummaries(client, kind, part.market, codes)")) {
  throw new Error("Async daily-cache persistence must pass the market kind to summary refresh");
}
const asyncFundamentalsStart = asyncDailyCacheSyncSource.indexOf("if (!skipFundamentals) {", asyncDailyCacheSyncSource.indexOf("async function fetchBatch"));
const asyncFundamentalsEnd = asyncDailyCacheSyncSource.indexOf("const compactTargetDate", asyncFundamentalsStart);
const asyncFundamentalsValidation = asyncFundamentalsStart >= 0 && asyncFundamentalsEnd > asyncFundamentalsStart
  ? asyncDailyCacheSyncSource.slice(asyncFundamentalsStart, asyncFundamentalsEnd)
  : "";
if (!asyncDailyCacheSyncSource.includes("payload.market !== market || payload.timeframe !== timeframe")
  || !asyncDailyCacheSyncSource.includes("payload = { ok: true, market, timeframe, items: [] }")) {
  throw new Error("Async daily-candle responses must match the requested market and timeframe");
}
const asyncIntegerParserPosition = asyncDailyCacheSyncSource.indexOf("function readIntegerOption(name, defaultValue, minimum, maximum = Number.MAX_SAFE_INTEGER)");
const asyncPoolCreationPosition = asyncDailyCacheSyncSource.indexOf("const pool = new Pool(");
const asyncLastIntegerOptionPosition = asyncDailyCacheSyncSource.indexOf('const maxInstruments = readIntegerOption("max-instruments", 0, 0);');
const asyncArgumentParserPosition = asyncDailyCacheSyncSource.indexOf("const supportedOptions = new Set([");
if (asyncArgumentParserPosition < 0
  || asyncIntegerParserPosition < asyncArgumentParserPosition
  || asyncPoolCreationPosition < 0
  || asyncLastIntegerOptionPosition < asyncIntegerParserPosition
  || asyncLastIntegerOptionPosition > asyncPoolCreationPosition
  || !asyncDailyCacheSyncSource.includes("if (!supportedOptions.has(name)) throw new Error(`Unknown option: --${name}`)")
  || !asyncDailyCacheSyncSource.includes("if (args.has(name)) throw new Error(`Duplicate option: --${name}`)")
  || !asyncDailyCacheSyncSource.includes("Positional arguments are not supported")
  || !asyncDailyCacheSyncSource.includes('if (booleanOptions.has(name) && !["true", "false"].includes(value))')
  || !asyncDailyCacheSyncSource.includes("if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be a safe integer`)")
  || !asyncDailyCacheSyncSource.includes('const saveConcurrency = readIntegerOption("save-workers", 2, 1, 4);')
  || !asyncDailyCacheSyncSource.includes('const queueLimit = readIntegerOption("queue", 10, 1, 50);')) {
  throw new Error("Async sync worker and queue CLI values must be validated before pool creation");
}
const asyncErrorSanitizer = asyncDailyCacheSyncSource.match(/function sanitizeErrorMessage\(value\) \{[\s\S]*?\n\}/)?.[0] ?? "";
const asyncErrorSummarizer = asyncDailyCacheSyncSource.match(/function summarizeRuntimeError\(error, depth = 0\) \{[\s\S]*?\n\}/)?.[0] ?? "";
if (!asyncErrorSanitizer.includes("postgres(?:ql)?|https?")
  || !asyncErrorSanitizer.includes("Bearer\\s+")
  || !asyncErrorSanitizer.includes("authorization|credential|signature|sig")
  || !asyncErrorSanitizer.includes("[#?&](?:password")
  || !asyncErrorSanitizer.includes("api[_-]?key|app[_-]?key|access[_-]?token")
  || !asyncErrorSanitizer.includes("\\s+(?:is|was)\\s+")
  || !asyncErrorSanitizer.includes("(?:Bearer|Basic)\\s+")
  || !asyncErrorSanitizer.includes(".slice(0, 500)")
  || !asyncErrorSummarizer.includes("error.cause !== undefined")
  || !asyncErrorSummarizer.includes("aggregateErrors.slice(0, 20)")
  || !asyncDailyCacheSyncSource.includes("formatRuntimeError(error)")
  || !asyncDailyCacheSyncSource.includes("fatalFailure = summarizeRuntimeError(error)")
  || !asyncDailyCacheSyncSource.includes("poolShutdownFailure = summarizeRuntimeError(error)")) {
  throw new Error("Async sync diagnostics must retain bounded nested causes while redacting sensitive values");
}
if (asyncDailyCacheSyncSource.split("\n").some((line) => line.includes("console.warn(") && line.includes("error.message"))) {
  throw new Error("Async sync warning logs must not print raw error messages");
}
if (!asyncFundamentalsValidation.includes("requestedFundamentalCodes.has(code)")
  || !asyncFundamentalsValidation.includes("returnedFundamentalCodes.has(code)")
  || !asyncFundamentalsValidation.includes("itemMarket !== String(market).trim().toUpperCase()")
  || !asyncFundamentalsValidation.includes('typeof item[field] !== "number"')
  || !asyncFundamentalsValidation.includes("!Number.isFinite(item[field])")
  || !asyncFundamentalsValidation.includes('typeof item.name !== "string"')
  || !asyncFundamentalsValidation.includes('typeof item.currency !== "string"')
  || !asyncFundamentalsValidation.includes("Date.parse(timestamp)")
  || !asyncFundamentalsValidation.includes("code: requestedFundamentalCodes.get")) {
  throw new Error("Async fundamentals rows must be validated against the requested market, codes, and field types before save");
}
if (!dailyCandleFallbackSource.includes("...(previous?.candles ?? [])")
  || !dailyCandleFallbackSource.includes('...result.candles.map((candle) => ({ ...candle, source: "OPERATING_CHART_API" }))')
  || !asyncDailyCacheSyncSource.includes("originalCandleCodes.has(code)")
  || !asyncDailyCacheSyncSource.includes("requestedCandleCodes.has(code)")
  || asyncDailyCacheSyncSource.includes("KR fallback incomplete")) {
  throw new Error("Daily chart fallback must preserve existing candles and reject malformed bulk rows without discarding usable history");
}
const asyncTransactionFailureHandling = asyncDailyCacheSyncSource.match(/async function persistParts\(kind, parts\) \{[\s\S]*?\n\}/)?.[0] ?? "";
if (!asyncTransactionFailureHandling.includes('client.release(true);')
  || !asyncTransactionFailureHandling.includes('LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN')
  || !asyncTransactionFailureHandling.includes('LOCAL_TRANSACTION_ROLLBACK_FAILED:')
  || !asyncTransactionFailureHandling.includes('new AggregateError([error, rollbackError]')) {
  throw new Error("Async daily-cache transaction failures must preserve commit uncertainty and both rollback errors");
}
if ((asyncDailyCacheSyncSource.match(/LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN/g) ?? []).length < 2
  || (asyncDailyCacheSyncSource.match(/LOCAL_TRANSACTION_ROLLBACK_FAILED:/g) ?? []).length < 2
  || (asyncDailyCacheSyncSource.match(/new AggregateError\(\[error, rollbackError\]/g) ?? []).length < 2) {
  throw new Error("All async daily-cache transactions must preserve commit and rollback failures");
}
const asyncPoolErrorListenerPosition = asyncDailyCacheSyncSource.indexOf('pool.on("error", (error) => {');
const asyncFirstPoolUsePosition = asyncDailyCacheSyncSource.indexOf("await pool.query(");
if (!asyncDailyCacheSyncSource.includes("const databaseConnectionTimeoutMs = 10_000;")
  || !asyncDailyCacheSyncSource.includes("connectionTimeoutMillis: databaseConnectionTimeoutMs")
  || asyncPoolErrorListenerPosition < 0
  || asyncFirstPoolUsePosition < 0
  || asyncPoolErrorListenerPosition > asyncFirstPoolUsePosition
  || !asyncDailyCacheSyncSource.includes("poolBackgroundErrorCount++;")
  || !asyncDailyCacheSyncSource.includes("const poolBackgroundFailure =")
  || !asyncDailyCacheSyncSource.includes("poolBackgroundFailure, telemetry, result")) {
  throw new Error("Async daily-cache sync must bound DB connection waits and report background pool errors as failures");
}
const asyncUsMarketCapFilterStart = asyncDailyCacheSyncSource.indexOf("if (kind === \"US\" && usMarketCapUnder !== null)");
const asyncUsMarketCapFilterEnd = asyncDailyCacheSyncSource.indexOf("if (marketCapUnder !== null || marketCapOver !== null)", asyncUsMarketCapFilterStart);
const asyncUsMarketCapFilter = asyncUsMarketCapFilterStart >= 0 && asyncUsMarketCapFilterEnd > asyncUsMarketCapFilterStart
  ? asyncDailyCacheSyncSource.slice(asyncUsMarketCapFilterStart, asyncUsMarketCapFilterEnd)
  : "";
if (!asyncUsMarketCapFilter.includes("WHERE u.enabled=true ${dailyActiveFilter}")
  || asyncUsMarketCapFilter.includes("u.daily_active=true")) {
  throw new Error("US market-cap filtering must preserve include-inactive-daily universe semantics");
}
if (!asyncDailyCacheSyncSource.includes('latest.fetched_at < $2')
  || !asyncDailyCacheSyncSource.includes('targetDate.replaceAll("-", ""), new Date(Date.now() - 30 * 60 * 1000)')) {
  throw new Error("Combining only-missing-date and only-unrefreshed must apply both date and freshness filters");
}
if (!asyncDailyCacheSyncSource.includes('if (onlyUnrefreshed && (marketArg !== "US" || timeframe !== "D"))')) {
  throw new Error("only-unrefreshed must be rejected outside US daily mode");
}
const asyncPoolEndPosition = asyncDailyCacheSyncSource.lastIndexOf("await pool.end();");
const asyncFinalJsonPosition = asyncDailyCacheSyncSource.lastIndexOf("console.log(JSON.stringify({ ok, mode: \"async-bounded-queue\"");
if (asyncPoolEndPosition < 0
  || asyncFinalJsonPosition <= asyncPoolEndPosition
  || !asyncDailyCacheSyncSource.includes("poolShutdownFailure = summarizeRuntimeError(error)")
  || !asyncDailyCacheSyncSource.includes("!fatalFailure && !poolShutdownFailure && !poolBackgroundFailure")) {
  throw new Error("Async daily-cache final output must follow pool shutdown and include execution/shutdown failures");
}
if (!asyncTransactionFailureHandling.includes('"open", "high", "low", "close", "volume"')
  || !asyncTransactionFailureHandling.includes("existingRow[field] !== normalizedRow[field]")
  || !asyncTransactionFailureHandling.includes("conflicting duplicate candle")
  || !asyncTransactionFailureHandling.includes("duplicateCandleRows++")) {
  throw new Error("Async daily-cache sync must reject conflicting duplicate candles and count only identical duplicates");
}
if (!asyncTransactionFailureHandling.includes("let duplicateCandleRows = 0;")
  || !asyncTransactionFailureHandling.includes("telemetry.duplicateCandleRows += duplicateCandleRows;")
  || !asyncTransactionFailureHandling.includes("return { saved, duplicateCandleRows }")
  || !asyncDailyCacheSyncSource.includes("duplicateCandleRows += persisted.duplicateCandleRows")
  || !asyncDailyCacheSyncSource.includes("duplicateCandleRows,")
  || !dailyCacheSyncResultSource.includes("result.saved + (result.duplicateCandleRows ?? 0) === result.fetched")) {
  throw new Error("Async daily-cache duplicate counts must include committed writes only and reach market results");
}
const poolErrorListenerPosition = dailyCacheSyncSource.indexOf('pool.on("error", (error) => {');
const firstPoolQueryPosition = dailyCacheSyncSource.indexOf("const universe = await pool.query(");
if (!dailyCacheSyncSource.includes("const databaseConnectionTimeoutMs = 10_000;")
  || poolErrorListenerPosition < 0 || firstPoolQueryPosition < 0 || poolErrorListenerPosition > firstPoolQueryPosition
  || !dailyCacheSyncSource.includes("poolBackgroundErrorCount += 1;")
  || !dailyCacheSyncSource.includes("firstPoolBackgroundError = summarizeError(error);")
  || !dailyCacheSyncSource.includes("!poolBackgroundFailure")
  || !dailyCacheSyncSource.includes("...(poolBackgroundFailure ? { poolBackgroundFailure } : {})")) {
  throw new Error("Daily-cache sync must bound PostgreSQL connection waits and report idle pool errors in its final result");
}
const poolEndPosition = dailyCacheSyncSource.lastIndexOf("await pool.end();");
const poolFailureAggregatePosition = dailyCacheSyncSource.indexOf("const poolBackgroundFailure = poolBackgroundErrorCount > 0");
const finalOkPosition = dailyCacheSyncSource.indexOf("const ok = !fatalFailure && !poolShutdownFailure && !poolBackgroundFailure");
const finalJsonPosition = dailyCacheSyncSource.indexOf("console.log(JSON.stringify({ ok, timeframe, limit, result");
const exitCodePosition = dailyCacheSyncSource.indexOf("if (!ok) process.exitCode = 1;");
if (poolEndPosition < 0 || poolFailureAggregatePosition <= poolEndPosition
  || finalOkPosition <= poolFailureAggregatePosition || finalJsonPosition <= finalOkPosition
  || exitCodePosition <= finalJsonPosition) {
  throw new Error("Daily-cache sync must close the pool before aggregating background errors and reporting final status");
}
if (!fundamentalsItemValidation.includes("!item || typeof item !== \"object\" || Array.isArray(item)")) {
  throw new Error("Daily-cache sync must reject null, primitive, and array fundamentals rows before property access");
}
for (const required of [
  "price", "changeRate", "open", "high", "low", "volume", "tradingValue", "marketCap", "listedShares",
  "field in item", "item[field] !== null", "typeof item[field] !== \"number\"", "!Number.isFinite(item[field])",
  "원격 기본정보 수치 필드 오류",
]) {
  if (!fundamentalsNumericValidation.includes(required)) {
    throw new Error(`Daily-cache sync must validate nullable finite fundamentals numbers before saving (${required})`);
  }
}
for (const required of [
  "typeof item.name !== \"string\"", "!(\"currency\" in item)", "item.currency !== null",
  "observedAt", "fetchedAt", "Date.parse(timestamp)", "timestamp !== null",
  "원격 기본정보 텍스트 필드 오류", "원격 기본정보 시간 필드 오류",
]) {
  if (!fundamentalsMetadataValidation.includes(required)) {
    throw new Error(`Daily-cache sync must validate fundamentals name, currency, and timestamps before saving (${required})`);
  }
}
for (const required of [
  "fundamentalsMissingCodeSample",
  "fundamentalsMissingCodeSample.push",
  "fundamentalsMissingCount: batchFundamentalsMissingCodes.length",
  "batchFundamentalsMissingCodes.slice(0, 20).map((code) => `${market}:${code}`)",
  "Math.max(0, 20 - fundamentalsMissingCodeSample.length)",
  "fundamentalsMissingCodeSample, failure",
]) {
  if (!dailyCacheSyncSource.includes(required)) throw new Error(`Daily-cache sync must expose missing fundamentals codes separately (${required})`);
}
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
  market_rss_fetch_snapshots: ["fetched_at"], market_rss_articles: ["source_snapshot_id", "published_at", "created_at"],
  market_rss_bullish_articles: ["published_at", "created_at"],
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
const retentionJobs = [...retentionRoute.matchAll(/batchedDelete\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,?\s*\)/gs)]
  .map(([, table, predicate]) => ({ table, predicate }));
for (const table of ["market_rss_articles", "market_rss_bullish_articles"]) {
  const job = retentionJobs.find((entry) => entry.table === table);
  if (!job
    || !job.predicate.includes("published_at < NOW() - INTERVAL '24 hours'")
    || !job.predicate.includes("published_at IS NULL")
    || !job.predicate.includes("created_at < NOW() - INTERVAL '24 hours'")) {
    throw new Error(`${table} must expire after 24 hours using created_at when published_at is missing`);
  }
}
const bullishRetentionJob = retentionJobs.find((entry) => entry.table === "market_rss_bullish_articles");
if (!bullishRetentionJob?.predicate.includes("source_article_id IN (SELECT id FROM market_rss_articles")) {
  throw new Error("Bullish projections linked to expired RSS articles must be removed before their parent rows");
}
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
const migrationsBeforeV168 = migrationFiles
  .filter(({ name }) => Number(name.match(/^V(\d+)__/i)?.[1] ?? Infinity) < 168)
  .sort((left, right) => Number(left.name.match(/^V(\d+)__/i)?.[1]) - Number(right.name.match(/^V(\d+)__/i)?.[1]));
const relationStateBeforeV168 = new Map();
for (const { sql } of migrationsBeforeV168) {
  for (const match of sql.matchAll(/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
    relationStateBeforeV168.set(match[1].toLowerCase(), "present");
  }
  for (const match of sql.matchAll(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
    relationStateBeforeV168.set(match[1].toLowerCase(), "dropped");
  }
}
for (const index of indexSpecs(retentionMigration)) {
  if (relationStateBeforeV168.get(index.table) !== "present") {
    throw new Error(`V168 cannot add an index to ${index.table}; migration history does not leave the table present before V168`);
  }
}
for (const [table, interval] of [
  ["kr_minute_candles", "30 days"], ["us_minute_candles", "30 days"],
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
  || !retentionRoute.includes('"market_rss_articles"')
  || !retentionRoute.includes('"market_rss_bullish_articles"')) {
  throw new Error("RSS feed snapshots and seven-day article retention must have separate cleanup paths");
}
if (!retentionRoute.includes("snapshot.source_type = 'SUBMISSIONS'")
  || !retentionRoute.includes("newer.source_type = snapshot.source_type")
  || !retentionRoute.includes("snapshot.source_type <> 'SUBMISSIONS'")
  || !retentionRoute.includes("snapshot.fetched_at < NOW() - INTERVAL '365 days'")
  || !retentionRoute.includes("snapshot.fetched_at < NOW() - INTERVAL '180 days'")) {
  throw new Error("SEC source snapshot cleanup must retain each issuer's latest submissions snapshot");
}
const rssRetentionMigrationConfigPath = path.resolve("db/migration/V169__rss_article_retention_indexes.sql.conf");
const rssRetentionMigrationConfig = fs.readFileSync(rssRetentionMigrationConfigPath, "utf8");
const rssRetentionMigration = migrationFiles.find(({ name }) => name === "V169__rss_article_retention_indexes.sql")?.sql ?? "";
if (!/^executeInTransaction=false\s*$/m.test(rssRetentionMigrationConfig)
  || (rssRetentionMigration.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/g) ?? []).length !== 3
  || !rssRetentionMigration.includes("ON market_rss_articles (published_at)")
  || (rssRetentionMigration.match(/WHERE published_at IS NULL/g) ?? []).length !== 2
  || !deployWorkflow.includes("cp db/migration/*.sql.conf \"$release_dir/db/migration/\"")
  || !deployWorkflow.includes("./db/migration/V169__rss_article_retention_indexes.sql.conf")) {
  throw new Error("V169 must ship concurrent RSS retention indexes outside a Flyway transaction");
}
const rssMaintenanceMigrations = ["V173__market_rss_72h_retention_indexes.sql", "V176__market_rss_query_order_indexes.sql"]
  .map((name) => migrationFiles.find((migration) => migration.name === name) ?? { name: "", sql: "" });
const rssMaintenanceIndexCounts = rssMaintenanceMigrations.map(({ sql }) => [...sql.matchAll(/CREATE INDEX IF NOT EXISTS/g)].length);
const rssMaintenanceHasConcurrentIndexes = rssMaintenanceMigrations.some(({ sql }) => /CREATE INDEX CONCURRENTLY\b/.test(sql));
const rssMaintenanceHasNonTransactionalConfig = rssMaintenanceMigrations.some(({ name }) =>
  name && fs.existsSync(path.resolve("db/migration", name.replace(/\.sql$/i, ".sql.conf"))));
if (rssMaintenanceMigrations.some((migration) => !migration.name)
  || rssMaintenanceIndexCounts[0] !== 2
  || rssMaintenanceIndexCounts[1] !== 4
  || rssMaintenanceHasConcurrentIndexes
  || rssMaintenanceHasNonTransactionalConfig) {
  throw new Error("V173/V176 RSS indexes must use transactional builds inside OCI's quiesced maintenance window");
}
const secMaterializerMigrationConfig = fs.readFileSync(path.resolve("db/migration/V170__sec_materializer_recent_index.sql.conf"), "utf8");
const secMaterializerMigration = migrationFiles.find(({ name }) => name === "V170__sec_materializer_recent_index.sql")?.sql ?? "";
if (!/^executeInTransaction=false\s*$/m.test(secMaterializerMigrationConfig)
  || !secMaterializerMigration.includes("CREATE INDEX CONCURRENTLY IF NOT EXISTS sec_submissions_materialize_acceptance_idx")
  || !secMaterializerMigration.includes("ON sec_submissions (acceptance_datetime DESC, accession)")
  || !secMaterializerMigration.includes("WHERE acceptance_datetime ~")
  || !deployWorkflow.includes("./db/migration/V170__sec_materializer_recent_index.sql.conf")) {
  throw new Error("V170 must package the concurrent SEC materializer ordering index outside a Flyway transaction");
}
const kisRateLimitRepairMigration = migrationFiles.find(({ name }) => name === "V178__repair_kis_rate_limit_event_indexes.sql")?.sql ?? "";
if (fs.existsSync(path.resolve("db/migration/V178__repair_kis_rate_limit_event_indexes.sql.conf"))
  || (kisRateLimitRepairMigration.match(/DROP INDEX IF EXISTS/g) ?? []).length !== 3
  || (kisRateLimitRepairMigration.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length !== 3
  || /INDEX CONCURRENTLY/i.test(kisRateLimitRepairMigration)
  || !kisRateLimitRepairMigration.includes("ON kis_rate_limit_events (occurred_at DESC)")
  || !kisRateLimitRepairMigration.includes("ON kis_rate_limit_events (endpoint, occurred_at DESC)")
  || !kisRateLimitRepairMigration.includes("ON kis_rate_limit_events (incident_id, occurred_at DESC)")) {
  throw new Error("V178 must replace the three KIS rate-limit event indexes transactionally inside OCI's quiesced maintenance window");
}
const publicKisRateLimitRepair = migrationFiles.find(({ name }) => name === "V179__repair_public_kis_rate_limit_event_indexes.sql")?.sql ?? "";
if (!publicKisRateLimitRepair
  || (publicKisRateLimitRepair.match(/DROP INDEX IF EXISTS public\./g) ?? []).length !== 3
  || (publicKisRateLimitRepair.match(/CREATE INDEX [a-z_]+\s+ON public\.kis_rate_limit_events/g) ?? []).length !== 3
  || /INDEX CONCURRENTLY/i.test(publicKisRateLimitRepair)
  || !publicKisRateLimitRepair.includes("ON public.kis_rate_limit_events (occurred_at DESC)")
  || !publicKisRateLimitRepair.includes("ON public.kis_rate_limit_events (endpoint, occurred_at DESC)")
  || !publicKisRateLimitRepair.includes("ON public.kis_rate_limit_events (incident_id, occurred_at DESC)")) {
  throw new Error("V179 must explicitly rebuild the three public KIS rate-limit indexes in the OCI maintenance window");
}
const sharedCronTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-cron.timer"), "utf8");
const sharedCronService = fs.readFileSync(path.resolve("deploy/oci/stockman-cron.service"), "utf8");
const stockmanService = fs.readFileSync(path.resolve("deploy/oci/stockman.service"), "utf8");
const activationScript = fs.readFileSync(path.resolve("deploy/oci/stockman-activate"), "utf8");
if (!/OnCalendar=hourly/.test(sharedCronTimer) || !/Persistent=true/.test(sharedCronTimer)
  || !sharedCronService.includes("scripts/oci-cron.sh")
  || !activationScript.includes("stockman-cron.timer")
  || !activationScript.includes("systemctl enable stockman-cron.timer")
  || !activationScript.includes("systemctl restart stockman-cron.timer")) {
  throw new Error("Database retention must be reachable from the persistent hourly OCI cron timer after activation");
}
if (!/^SupplementaryGroups=systemd-journal$/m.test(stockmanService)
  || !activationScript.includes("getent group systemd-journal")
  || !activationScript.includes('install -m 0644 "$DEPLOY_PATH/deploy/oci/stockman.service" /etc/systemd/system/stockman.service')) {
  throw new Error("Authenticated server journal diagnostics require the app unit to receive read-only systemd-journal access on deployment");
}
const obvSnapshotCall = 'run_cron_endpoint "us-obv-divergence-snapshot" 600 "/api/cron/us-obv-divergence-snapshot"';
const healthProbeCall = 'run_cron_endpoint "health-probe-snapshot" 20 "/api/cron/health-probe-snapshot"';
const krDailyCacheCall = 'run_cron_endpoint "kr-daily-cache" 3600 "/api/cron/kr-daily-cache"';
const usDailyCacheCall = 'run_cron_endpoint "us-daily-cache" 3600 "/api/cron/us-daily-cache"';
const dbRetentionCall = 'run_cron_endpoint "db-retention" 60 "/api/cron/db-retention"';
if (!source.includes(healthProbeCall) || !source.includes(krDailyCacheCall) || !source.includes(usDailyCacheCall)
  || source.indexOf(healthProbeCall) > source.indexOf(krDailyCacheCall)
  || source.indexOf(krDailyCacheCall) > source.indexOf(usDailyCacheCall)
  || source.indexOf(usDailyCacheCall) > source.indexOf(dbRetentionCall)
  || matches[0]?.[1] !== "health-probe-snapshot"
  || matches[1]?.[1] !== "kr-daily-cache"
  || matches[2]?.[1] !== "us-daily-cache") {
  throw new Error("Health probe must be followed immediately by KR and US daily candle refreshes before other hourly OCI work");
}
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
const appService = fs.readFileSync(path.resolve("deploy/oci/stockman.service"), "utf8");
const activation = fs.readFileSync(path.resolve("deploy/oci/stockman-activate"), "utf8");
const discordCommandRegistration = fs.readFileSync(path.resolve("scripts/register-discord-commands.mjs"), "utf8");
const workflow = fs.readFileSync(path.resolve(".github/workflows/deploy-oci.yml"), "utf8");
const flywayPreflight = fs.readFileSync(path.resolve("scripts/oci-flyway-v168-preflight.mjs"), "utf8");
const automationRuns = fs.readFileSync(path.resolve("lib/automation-run-repository.ts"), "utf8");
const rssTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-rss.timer"), "utf8");
const rssRoute = fs.readFileSync(path.resolve("app/api/cron/market-rss/route.ts"), "utf8");
const rssDiscordPolicy = fs.readFileSync(path.resolve("lib/market-rss-discord-policy.ts"), "utf8");
const rssTranslationGate = fs.readFileSync(path.resolve("lib/market-rss-notification-translation-gate.ts"), "utf8");
const secRssSource = fs.readFileSync(path.resolve("lib/sec-edgar-rss.ts"), "utf8");

if (source.includes("/api/cron/instrument-fundamentals")) {
  throw new Error("Instrument fundamentals must not run inline in the shared cron pipeline");
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
if (!/^SupplementaryGroups=systemd-journal$/m.test(appService)
  || !activation.includes('install -m 0644 "$DEPLOY_PATH/deploy/oci/stockman.service" /etc/systemd/system/stockman.service')
  || !workflow.includes('cp deploy/oci/stockman.service "$release_dir/deploy/oci/stockman.service"')
  || !workflow.includes("./deploy/oci/stockman.service")
  || !nginx.includes("error_log stderr warn;")
  || !nginx.includes("tag=stockman_nginx_access")
  || !nginx.includes("$upstream_response_time")
  || !nginx.includes("if=$stockman_debug_loggable")
  || !nginx.includes("~^[45]: 1;")
  || !nginx.includes("~^[23]:[1-9] 1;")
  || /log_format stockman_debug[^;]*(?:\$request_uri|\$args)/.test(nginx)) {
  throw new Error("Authenticated diagnostics require app journal access and Nginx error/access records in the system journal");
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
if (!workflow.includes("oci-flyway-v168-preflight.mjs")
  || !workflow.includes("ServerAliveInterval=30")
  || !activation.includes("flyway-repair-approved-indexes")
  || !activation.includes("2400s docker run")
  || !/name: Activate release\s+timeout-minutes: 45/.test(workflow)
  || !flywayPreflight.includes("DROP INDEX ${concurrent}IF EXISTS")
  || !flywayPreflight.includes("connectionTimeoutMillis: 15_000")
  || !flywayPreflight.includes("statement_timeout: 60_000")
  || !flywayPreflight.includes("pg_stat_activity")
  || !flywayPreflight.includes("old database snapshots")
  || !flywayPreflight.includes("failedMigrationVersions")
  || !flywayPreflight.includes('new Set(["168", "170", "173", "176", "178", "179"])')
  || !flywayPreflight.includes("market_rss_articles")
  || !flywayPreflight.includes("sec_submissions")
  || !flywayPreflight.includes("refusing automatic repair")) {
  throw new Error("OCI Flyway activation must log index diagnostics and repair only approved V168/V170/V173/V176/V178/V179 failures");
}
if (!activation.includes('chmod +x "$TEMP_PATH/scripts/oci-fundamentals-cron.sh"')) {
  throw new Error("Deployment activation must make the dedicated fundamentals runner executable");
}
if (!deploymentVerifierSource.includes('scripts/test-oci-activation-preflight.mjs')) {
  throw new Error("Deployment verification must run the OCI activation preflight regression suite");
}
if (!workflow.includes("terminate-approved-oci-snapshot-holders.mjs")
  || !activation.includes('stage="quiesce-services"')
  || !activation.includes('systemctl stop "$unit"')
  || !activation.includes('preflight_attempt" -ge 20')
  || !activation.includes('sleep 30')
  || !activation.includes('OCI index preflight found old database snapshots')
  || !activation.includes('preflight_attempt=$((preflight_attempt + 1))')
  || !activation.includes("OCI_PG_TERMINATION_APPROVED_PIDS=246213,246722,246903,247294,247463,247509,248010,248077,248691,248857,249223,249386,249548,249564,249815,249816,250094,250277,250401,250475,250476,250751,253038,260900,261867,308675,321998")
  || !activation.includes("explicit-approved-pids")
  || !activation.includes("terminate-approved-oci-snapshot-holders.mjs")
  || !fs.readFileSync(path.resolve("scripts/terminate-approved-oci-snapshot-holders.mjs"), "utf8").includes("const MIN_SNAPSHOT_AGE_SECONDS = 3_600;")
  || !fs.readFileSync(path.resolve("scripts/terminate-approved-oci-snapshot-holders.mjs"), "utf8").includes("application_name = 'PostgreSQL JDBC Driver'")
  || !fs.readFileSync(path.resolve("scripts/terminate-approved-oci-snapshot-holders.mjs"), "utf8").includes("state = 'idle in transaction'")
  || !activation.includes('if [ "$SERVICES_QUIESCED" = "1" ]')) {
  throw new Error("V168 activation must pause DB services, target only the explicitly approved PID, and restore services on failure");
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
if ((automationRuns.match(/CASE WHEN module_key = 'instrument-fundamentals' THEN \$[23](?:::(?:double precision|bigint|integer))? ELSE \$[12](?:::(?:double precision|bigint|integer))? END/g) ?? []).length < 2 ||
    !automationRuns.includes("[moduleKey, STALE_RUN_AFTER_SECONDS, FUNDAMENTALS_STALE_RUN_AFTER_SECONDS]")) {
  throw new Error("Stale reconciliation and active-run detection must both use the module-specific timeout");
}

console.log(`OCI cron structure OK (${matches.length} shared endpoints + isolated long-running fundamentals timer)`);
