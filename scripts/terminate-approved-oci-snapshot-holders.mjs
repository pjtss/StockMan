import pg from "pg";

const MIN_SNAPSHOT_AGE_SECONDS = 30;
const APPROVED_SCOPE = "explicit-approved-pids";
const approvedPids = [...new Set((process.env.OCI_PG_TERMINATION_APPROVED_PIDS ?? "")
  .split(",")
  .map((pid) => pid.trim())
  .filter(Boolean))];

if (process.env.OCI_PG_TERMINATION_APPROVED_SCOPE !== APPROVED_SCOPE) {
  throw new Error("Explicit approval marker for the exact PID allowlist is required");
}
if (approvedPids.length === 0 || approvedPids.some((pid) => !/^\d+$/.test(pid) || Number(pid) <= 0)) {
  throw new Error("OCI_PG_TERMINATION_APPROVED_PIDS must contain explicit positive PID values");
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
  application_name: "codex-approved-active-snapshot-termination-20261117",
});

const currentTargetsSql = `
  SELECT pid, backend_type, application_name, usename, client_addr::text, state, wait_event_type, wait_event,
    backend_xmin IS NOT NULL AS holds_snapshot,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid = ANY($2::integer[])
    AND pid <> pg_backend_pid()
    AND backend_type = 'client backend'
    AND backend_xmin IS NOT NULL
    AND xact_start < NOW() - ($1::integer * INTERVAL '1 second')
  ORDER BY xact_start
`;

try {
  await client.connect();
  const current = await client.query(currentTargetsSql, [MIN_SNAPSHOT_AGE_SECONDS, approvedPids]);
  const candidatePids = current.rows.map(({ pid }) => pid);
  console.log(JSON.stringify({
    approvedScope: APPROVED_SCOPE,
    approvedPids,
    minimumSnapshotAgeSeconds: MIN_SNAPSHOT_AGE_SECONDS,
    targets: current.rows,
  }));

  if (candidatePids.length === 0) {
    console.log(JSON.stringify({ terminatedPids: [], remainingPids: [] }));
  } else {
    // Repeat the complete preflight predicate in the same statement that sends
    // signals. Include idle-in-transaction client sessions that retain snapshots.
    const result = await client.query(`
    WITH candidates AS MATERIALIZED (
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid = ANY($1::integer[])
        AND pid <> pg_backend_pid()
        AND backend_type = 'client backend'
        AND backend_xmin IS NOT NULL
        AND xact_start < NOW() - ($2::integer * INTERVAL '1 second')
    ),
    complete_candidate_set AS MATERIALIZED (
      SELECT ARRAY_AGG(pid ORDER BY pid) AS pids
      FROM candidates
      HAVING COUNT(*) = CARDINALITY($1::integer[])
    ),
    termination_results AS MATERIALIZED (
      SELECT target.pid, pg_terminate_backend(target.pid) AS terminated
      FROM complete_candidate_set
      CROSS JOIN LATERAL UNNEST(complete_candidate_set.pids) AS target(pid)
    )
    SELECT pid, terminated
    FROM termination_results
    ORDER BY pid
    `, [candidatePids, MIN_SNAPSHOT_AGE_SECONDS]);

    if (result.rows.length !== candidatePids.length || result.rows.some(({ terminated }) => terminated !== true)) {
      console.log(JSON.stringify({ candidatePids, terminationResults: result.rows }));
      throw new Error("PostgreSQL did not confirm termination for the complete revalidated snapshot-holder set");
    }

    const terminatedPids = result.rows.filter(({ terminated }) => terminated).map(({ pid }) => pid);
    const deadline = Date.now() + 10_000;
    let remaining = terminatedPids;
    while (Date.now() < deadline && remaining.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const check = await client.query(
        "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid = ANY($1::integer[]) ORDER BY pid",
        [terminatedPids],
      );
      remaining = check.rows.map(({ pid }) => pid);
    }

    console.log(JSON.stringify({ approvedScope: APPROVED_SCOPE, terminatedPids, remainingPids: remaining }));
    if (remaining.length > 0) throw new Error("One or more terminated PIDs remain in pg_stat_activity");
  }
} finally {
  await client.end().catch(() => undefined);
}
