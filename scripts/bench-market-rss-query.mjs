import { Client } from "pg";
import { performance } from "node:perf_hooks";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required; load it from .env.local");
const databaseUrl = new URL(connectionString);
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to benchmark a non-local database; DATABASE_URL host is not loopback");
}

const args = process.argv.slice(2);
const arg = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = (arg("source") || "STOCKTITAN").toUpperCase();
const dateArg = arg("date");
const samples = Math.min(100, Math.max(5, Number(arg("samples") || 20)));
const allowedSources = new Set(["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"]);
if (!allowedSources.has(source)) throw new Error("Unsupported RSS source");
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error("--date must be YYYY-MM-DD");

const narrowColumns = `
  id, source, title, summary, detected_ticker, event_direction,
  financing_amount_usd, dilution_risk, link, published_at, translated_title,
  translation_candidate_title, translation_provider, translation_char_count,
  translation_skipped_reason, translation_attempted_at, category, priority,
  notify_eligible, is_backlog, translation_status, translation_fallback,
  translation_attempts, translation_error, notification_status, last_error, updated_at`;
const whereClause = "WHERE source = $1 AND published_at >= $2::timestamptz AND published_at < $3::timestamptz";
const whereOrder = `FROM market_rss_articles ${whereClause} ORDER BY priority DESC, published_at DESC NULLS LAST, id ASC`;
const queries = {
  full: `SELECT * ${whereOrder}`,
  narrow: `SELECT ${narrowColumns} ${whereOrder}`,
};
const client = new Client({ connectionString });

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function summarize(values) {
  return {
    p50Ms: Number(percentile(values.map((value) => value.durationMs), 0.5).toFixed(3)),
    p95Ms: Number(percentile(values.map((value) => value.durationMs), 0.95).toFixed(3)),
    medianJsonBytes: percentile(values.map((value) => value.jsonBytes), 0.5),
  };
}

try {
  await client.connect();
  const date = dateArg ?? (await client.query(
    "SELECT to_char(MAX(published_at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date FROM market_rss_articles WHERE source = $1 AND published_at IS NOT NULL",
    [source],
  )).rows[0]?.date;
  if (!date) throw new Error(`No dated RSS articles found for ${source}; provide --date if published_at is empty`);
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const params = [source, start.toISOString(), end.toISOString()];

  const count = Number((await client.query(`SELECT COUNT(*)::int AS count FROM market_rss_articles ${whereClause}`, params)).rows[0].count);
  if (count === 0) throw new Error(`No ${source} articles found in the KST date ${date}; refusing to report an empty-set benchmark`);

  const plans = {};
  for (const [kind, query] of Object.entries(queries)) {
    const explain = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, params);
    const root = explain.rows[0]["QUERY PLAN"][0];
    plans[kind] = {
      planningTimeMs: root["Planning Time"],
      executionTimeMs: root["Execution Time"],
      node: root.Plan["Node Type"],
      sharedHitBlocks: root.Plan["Shared Hit Blocks"] ?? 0,
      sharedReadBlocks: root.Plan["Shared Read Blocks"] ?? 0,
    };
  }

  const results = { full: [], narrow: [] };
  for (let index = 0; index < samples + 2; index++) {
    for (const kind of index % 2 === 0 ? ["full", "narrow"] : ["narrow", "full"]) {
      const before = performance.now();
      const result = await client.query(queries[kind], params);
      const durationMs = performance.now() - before;
      if (result.rowCount !== count) throw new Error(`${kind} query returned ${result.rowCount} rows; expected ${count}`);
      if (index >= 2) results[kind].push({ durationMs, jsonBytes: Buffer.byteLength(JSON.stringify(result.rows)) });
    }
  }

  const full = summarize(results.full);
  const narrow = summarize(results.narrow);
  console.log(JSON.stringify({
    database: { host: databaseUrl.hostname, port: databaseUrl.port || "5432", database: databaseUrl.pathname.slice(1) },
    source,
    kstDate: date,
    rows: count,
    samplesPerQuery: samples,
    resultMetrics: {
      fullSelect: full,
      requiredColumns: narrow,
      p50LatencyReductionPercent: Number(((full.p50Ms - narrow.p50Ms) / full.p50Ms * 100).toFixed(1)),
      jsonPayloadReductionPercent: Number(((full.medianJsonBytes - narrow.medianJsonBytes) / full.medianJsonBytes * 100).toFixed(1)),
    },
    explainAnalyze: plans,
    limitation: "EXPLAIN ANALYZE measures PostgreSQL execution; query latency includes local PostgreSQL client transfer and JSON serialization measures the row payload, not a full HTTP response.",
  }, null, 2));
} finally {
  await client.end().catch(() => {});
}
