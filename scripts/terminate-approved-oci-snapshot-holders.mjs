import pg from "pg";

const APPROVED_PIDS = [218746, 219115];
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
  application_name: "codex-approved-pg-snapshot-termination-218746-219115",
});

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
  const current = await client.query(currentTargetsSql, [APPROVED_PIDS]);
  const matchesApproval = current.rows.length === APPROVED_PIDS.length
    && current.rows.every((row, index) => row.pid === APPROVED_PIDS[index]
      && row.backend_type === "client backend"
      && row.state === "active"
      && row.holds_snapshot === true
      && row.transaction_age_seconds >= MIN_TRANSACTION_AGE_SECONDS);

  if (!matchesApproval) {
    console.log(JSON.stringify({ approvedPids: APPROVED_PIDS, matchedApprovedState: false, terminatedPids: [] }));
    throw new Error("Approved PIDs no longer match the rechecked active snapshot state; no session was terminated");
  }

  console.log(JSON.stringify({
    approvedPids: APPROVED_PIDS,
    matchedApprovedState: true,
    targets: current.rows,
  }));

  // Recheck the exact approved PID set and its state in the same statement that
  // sends termination signals. If either PID changed state, this returns no rows.
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
        AND xact_start < NOW() - INTERVAL '60 minutes'
    ),
    complete_approved_set AS MATERIALIZED (
      SELECT ARRAY_AGG(pid ORDER BY pid) AS pids
      FROM candidates
      HAVING COUNT(*) = CARDINALITY($1::integer[])
    )
    SELECT target.pid, pg_terminate_backend(target.pid) AS terminated
    FROM complete_approved_set
    CROSS JOIN LATERAL UNNEST(complete_approved_set.pids) AS target(pid)
    ORDER BY target.pid
  `, [APPROVED_PIDS]);

  if (result.rows.length !== APPROVED_PIDS.length || result.rows.some((row) => row.terminated !== true)) {
    console.log(JSON.stringify({ approvedPids: APPROVED_PIDS, terminationResults: result.rows }));
    throw new Error("PostgreSQL did not confirm termination for the complete approved PID set");
  }

  const deadline = Date.now() + 10_000;
  let remaining = APPROVED_PIDS;
  while (Date.now() < deadline && remaining.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const check = await client.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid = ANY($1::integer[]) ORDER BY pid",
      [APPROVED_PIDS],
    );
    remaining = check.rows.map(({ pid }) => pid);
  }

  console.log(JSON.stringify({
    approvedPids: APPROVED_PIDS,
    terminatedPids: result.rows.filter(({ terminated }) => terminated).map(({ pid }) => pid),
    remainingPids: remaining,
  }));
  if (remaining.length > 0) throw new Error("Termination signal was confirmed, but one or more approved PIDs remain in pg_stat_activity");
} finally {
  await client.end().catch(() => undefined);
}
