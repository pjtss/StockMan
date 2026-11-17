import pg from "pg";

const APPROVED_PIDS = [238702, 238866, 239061, 239261];
const MIN_TRANSACTION_AGE_SECONDS = 60 * 60;
const approvedPidsMarker = process.env.OCI_PG_TERMINATION_APPROVED_PIDS;

if (approvedPidsMarker !== APPROVED_PIDS.join(",")) {
  throw new Error("Explicit approval marker for exactly the approved PIDs is required");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const databaseHost = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Refusing session termination because OCI DATABASE_URL is not local");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: "codex-approved-pg-snapshot-termination-20261117",
});

const migrationSql = await (await import("node:fs/promises")).readFile(
  "db/migration/V168__bounded_non_daily_data_retention.sql",
  "utf8",
);
const migrationIndexes = [...migrationSql.matchAll(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)]
  .map((match) => match[1]);
if (migrationIndexes.length === 0) throw new Error("V168 migration index list is empty");

const currentTargetsSql = `
  SELECT pid, backend_type, state, wait_event_type, wait_event,
    backend_xmin IS NOT NULL AS holds_snapshot,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid = ANY($1::integer[])
  ORDER BY pid
`;

try {
  await client.connect();
  const allSnapshotHolders = await client.query(`
    SELECT pid, backend_type, state, wait_event_type, wait_event,
      backend_xmin IS NOT NULL AS holds_snapshot,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_xmin IS NOT NULL
      AND xact_start < NOW() - INTERVAL '30 seconds'
    ORDER BY xact_start
    LIMIT 20
  `);
  const flyway168 = await client.query(`
    SELECT version, success, installed_on, execution_time
    FROM flyway_schema_history
    WHERE version = '168'
    ORDER BY installed_rank DESC
    LIMIT 3
  `);
  const invalidIndexes = await client.query(`
    SELECT index_class.relname AS index_name
    FROM pg_index AS index_state
    JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid
    JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
    WHERE index_schema.nspname = current_schema()
      AND NOT index_state.indisvalid
      AND index_class.relname = ANY($1::text[])
    ORDER BY index_class.relname
  `, [migrationIndexes]);
  const indexProgress = await client.query(`
    SELECT pid, relid::regclass::text AS table_name, index_relid::regclass::text AS index_name,
      command, phase, blocks_total, blocks_done, tuples_total, tuples_done
    FROM pg_stat_progress_create_index
    ORDER BY pid
  `);
  console.log(JSON.stringify({
    diagnostic: true,
    snapshotHolders: allSnapshotHolders.rows,
    flyway168: flyway168.rows,
    invalidV168Indexes: invalidIndexes.rows,
    createIndexProgress: indexProgress.rows,
  }));
  const current = await client.query(currentTargetsSql, [APPROVED_PIDS]);
  const eligiblePids = current.rows
    .filter((row) => row.backend_type === "client backend"
      && row.state === "active"
      && row.holds_snapshot === true
      && row.transaction_age_seconds >= MIN_TRANSACTION_AGE_SECONDS)
    .map(({ pid }) => pid);

  console.log(JSON.stringify({ approvedPids: APPROVED_PIDS, targets: current.rows, eligiblePids }));
  if (eligiblePids.length === 0) {
    console.log(JSON.stringify({ terminatedPids: [], remainingPids: [] }));
    process.exitCode = 0;
  } else {

  // Recheck only the eligible approved subset in the same statement that sends
  // signals. Sessions outside that subset and all parallel workers are untouched.
  const result = await client.query(`
    WITH candidates AS MATERIALIZED (
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid = ANY($1::integer[])
        AND pid <> pg_backend_pid()
        AND backend_type = 'client backend'
        AND state = 'active'
        AND backend_xmin IS NOT NULL
        AND xact_start < NOW() - ($2::integer * INTERVAL '1 second')
    ),
    complete_approved_set AS MATERIALIZED (
      SELECT ARRAY_AGG(pid ORDER BY pid) AS pids
      FROM candidates
      HAVING COUNT(*) > 0
    )
    SELECT target.pid, pg_terminate_backend(target.pid) AS terminated
    FROM complete_approved_set
    CROSS JOIN LATERAL UNNEST(complete_approved_set.pids) AS target(pid)
    ORDER BY target.pid
  `, [eligiblePids, MIN_TRANSACTION_AGE_SECONDS]);

  if (result.rows.some((row) => row.terminated !== true)) {
    console.log(JSON.stringify({ approvedPids: APPROVED_PIDS, eligiblePids, terminationResults: result.rows }));
    throw new Error("PostgreSQL did not confirm termination for each eligible approved PID");
  }

  const deadline = Date.now() + 10_000;
  const terminatedPids = result.rows.filter(({ terminated }) => terminated).map(({ pid }) => pid);
  let remaining = terminatedPids;
  while (Date.now() < deadline && remaining.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const check = await client.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid = ANY($1::integer[]) ORDER BY pid",
      [terminatedPids],
    );
    remaining = check.rows.map(({ pid }) => pid);
  }

  console.log(JSON.stringify({
    approvedPids: APPROVED_PIDS,
    eligiblePids,
    terminatedPids,
    remainingPids: remaining,
  }));
  if (remaining.length > 0) throw new Error("Termination signal was confirmed, but one or more terminated PIDs remain in pg_stat_activity");
  }
} finally {
  await client.end().catch(() => undefined);
}
