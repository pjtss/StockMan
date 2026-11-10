import { readFile } from "node:fs/promises";
import pg from "pg";

const [migrationPath] = process.argv.slice(2);
if (!migrationPath) throw new Error("V168 migration path is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = await readFile(migrationPath, "utf8");
const indexNames = [...sql.matchAll(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)]
  .map((match) => match[1]);
if (indexNames.length === 0) throw new Error("No concurrent indexes found in V168 migration");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ...(new URL(process.env.DATABASE_URL).hostname === "localhost" || new URL(process.env.DATABASE_URL).hostname === "127.0.0.1"
    ? {}
    : { ssl: { rejectUnauthorized: false } }),
});

try {
  await client.connect();
  const failedMigrations = await client.query(`
    SELECT version
    FROM flyway_schema_history
    WHERE success = false
    ORDER BY installed_rank
  `);
  const unexpectedFailures = failedMigrations.rows.filter(({ version }) => version !== "168");
  if (unexpectedFailures.length > 0) {
    throw new Error("Flyway history contains a failed migration outside V168; refusing automatic repair");
  }
  const schema = await client.query("SELECT current_schema() AS schema_name");
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
    if (!indexNames.includes(indexName)) throw new Error("Unexpected invalid index in V168 preflight");
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(schema.rows[0].schema_name)}.${quoteIdentifier(indexName)}`);
  }

  process.stdout.write(`${JSON.stringify({
    invalidIndexesRemoved: invalidIndexes.rowCount,
    repairRequired: failedMigrations.rowCount > 0,
  })}\n`);
} finally {
  await client.end();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
