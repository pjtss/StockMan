import { readFile } from "node:fs/promises";
import pg from "pg";

const migrationPaths = process.argv.slice(2);
if (migrationPaths.length === 0) throw new Error("OCI index migration paths are required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = (await Promise.all(migrationPaths.map((migrationPath) => readFile(migrationPath, "utf8")))).join("\n");
const indexNames = [...sql.matchAll(/CREATE\s+INDEX(?:\s+CONCURRENTLY)?\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)]
  .map((match) => match[1]);
const concurrentIndexNames = new Set([...sql.matchAll(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)]
  .map((match) => match[1]));
if (indexNames.length === 0) throw new Error("No index targets found in OCI index migrations");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 60_000,
  ...(new URL(process.env.DATABASE_URL).hostname === "localhost" || new URL(process.env.DATABASE_URL).hostname === "127.0.0.1"
    ? {}
    : { ssl: { rejectUnauthorized: false } }),
});

try {
  process.stderr.write("OCI index preflight: connecting to configured database\n");
  await client.connect();
  process.stderr.write("OCI index preflight: database connected; checking Flyway history and indexes\n");
  const failedMigrations = await client.query(`
    SELECT version
    FROM flyway_schema_history
    WHERE success = false
    ORDER BY installed_rank
  `);
  const repairableFailedVersions = new Set(["168", "170", "173", "176", "178"]);
  const unexpectedFailures = failedMigrations.rows.filter(({ version }) => !repairableFailedVersions.has(version));
  if (unexpectedFailures.length > 0) {
    throw new Error("Flyway history contains a failed migration outside the approved index repair set; refusing automatic repair");
  }
  const schema = await client.query("SELECT current_schema() AS schema_name");
  const tableStats = await client.query(`
    SELECT pg_relation_size($1::regclass)::bigint AS table_bytes,
      (SELECT reltuples::bigint FROM pg_class WHERE oid = $1::regclass) AS estimated_rows
  `, [`${schema.rows[0].schema_name}.sec_submissions`]);
  const indexStats = await client.query(`
    SELECT index_class.relname AS index_name, index_state.indisvalid, index_state.indisready
    FROM pg_index AS index_state
    JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid
    JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
    WHERE index_schema.nspname = $2 AND index_class.relname = ANY($1::text[])
    ORDER BY index_class.relname
  `, [indexNames, schema.rows[0].schema_name]);
  const rssTableStats = await client.query(`
    SELECT relation.relname AS table_name,
      pg_relation_size(relation.oid)::bigint AS table_bytes,
      relation.reltuples::bigint AS estimated_rows
    FROM pg_class AS relation
    JOIN pg_namespace AS relation_schema ON relation_schema.oid = relation.relnamespace
    WHERE relation_schema.nspname = $1
      AND relation.relname = ANY($2::text[])
      AND relation.relkind IN ('r', 'p')
    ORDER BY relation.relname
  `, [schema.rows[0].schema_name, ["market_rss_articles", "market_rss_bullish_articles"]]);
  process.stderr.write(`OCI index preflight: table/index state ${JSON.stringify({ secSubmissionTable: tableStats.rows[0], rssTables: rssTableStats.rows, indexes: indexStats.rows })}\n`);
  const oldSnapshots = await client.query(`
    SELECT pid, backend_type, application_name, usename, client_addr::text, state, wait_event_type, wait_event,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_xmin IS NOT NULL
      AND xact_start < NOW() - INTERVAL '30 seconds'
    ORDER BY xact_start
    LIMIT 20
  `);
  if (oldSnapshots.rowCount > 0) {
    process.stderr.write(`OCI index preflight: old snapshot holders detected ${JSON.stringify(oldSnapshots.rows)}\n`);
    throw new Error("OCI index preflight found old database snapshots; refusing index cleanup until they finish");
  }
  const invalidIndexes = await client.query(`
    SELECT index_class.relname AS index_name
    FROM pg_index AS index_state
    JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid
    JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
    WHERE index_schema.nspname = $2
      AND NOT index_state.indisvalid
      AND index_class.relname = ANY($1::text[])
    ORDER BY index_class.relname
  `, [indexNames, schema.rows[0].schema_name]);

  for (const { index_name: indexName } of invalidIndexes.rows) {
    if (!indexNames.includes(indexName)) throw new Error("Unexpected invalid index in OCI preflight");
    process.stderr.write(`OCI index preflight: dropping invalid index ${indexName}\n`);
    const concurrent = concurrentIndexNames.has(indexName) ? "CONCURRENTLY " : "";
    await client.query(`DROP INDEX ${concurrent}IF EXISTS ${quoteIdentifier(schema.rows[0].schema_name)}.${quoteIdentifier(indexName)}`);
  }

  process.stdout.write(`${JSON.stringify({
    invalidIndexesRemoved: invalidIndexes.rowCount,
    repairRequired: failedMigrations.rowCount > 0,
    failedMigrationVersions: failedMigrations.rows.map(({ version }) => version),
  })}\n`);
} finally {
  await client.end();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
