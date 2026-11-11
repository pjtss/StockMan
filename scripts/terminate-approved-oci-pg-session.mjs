import pg from "pg";

const TARGET_PID = 4178222;
if (process.env.OCI_PG_TERMINATION_APPROVED_PID !== String(TARGET_PID)) {
  throw new Error("Explicit approval marker for the single target PID is required");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const databaseHost = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Refusing termination because the OCI server DATABASE_URL is not local");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
  application_name: "codex-approved-pg-termination-4178222",
});
const candidateSql = `
  SELECT pid, backend_type, state, wait_event_type, wait_event,
    backend_xmin IS NOT NULL AS holds_snapshot,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid = $1
    AND pid <> pg_backend_pid()
    AND backend_type = 'client backend'
    AND state = 'idle in transaction'
    AND wait_event_type = 'Client'
    AND wait_event = 'ClientRead'
    AND backend_xmin IS NOT NULL
    AND xact_start < NOW() - INTERVAL '15 hours'
`;

try {
  await client.connect();
  const checked = await client.query(candidateSql, [TARGET_PID]);
  if (checked.rowCount !== 1) {
    console.log(JSON.stringify({ targetPid: TARGET_PID, matchedApprovedState: false, terminated: false }));
    throw new Error("Target PID no longer matches the approved stale idle-transaction state; no session was terminated");
  }
  const session = checked.rows[0];
  console.log(JSON.stringify({
    targetPid: session.pid,
    state: session.state,
    waitEventType: session.wait_event_type,
    waitEvent: session.wait_event,
    holdsSnapshot: session.holds_snapshot,
    transactionAgeSeconds: session.transaction_age_seconds,
  }));

  // Recheck all predicates in the same SQL statement that signals this exact PID.
  const termination = await client.query(`
    WITH candidate AS MATERIALIZED (
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid = $1
        AND pid <> pg_backend_pid()
        AND backend_type = 'client backend'
        AND state = 'idle in transaction'
        AND wait_event_type = 'Client'
        AND wait_event = 'ClientRead'
        AND backend_xmin IS NOT NULL
        AND xact_start < NOW() - INTERVAL '15 hours'
    )
    SELECT pid, pg_terminate_backend(pid) AS terminated
    FROM candidate
  `, [TARGET_PID]);
  if (termination.rowCount !== 1 || termination.rows[0].terminated !== true) {
    throw new Error("PostgreSQL did not confirm termination of the approved target PID");
  }
  console.log(JSON.stringify({ targetPid: TARGET_PID, terminationSignalSent: true }));
} finally {
  await client.end().catch(() => undefined);
}