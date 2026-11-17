import pg from "pg";

const APPROVED_PIDS = [238702, 238866, 239061, 239261];
const MIN_TRANSACTION_AGE_SECONDS = 60 * 60;
const APPROVED_PID_MARKER = APPROVED_PIDS.join(",");
const V168_INDEX_NAMES = [
  "kr_minute_fetch_logs_retention_idx",
  "automation_runs_retention_idx",
  "debug_run_items_retention_idx",
  "us_trade_intensity_ticks_retention_idx",
  "intraday_detection_transitions_retention_idx",
  "us_minute_candles_retention_idx",
  "kr_minute_candles_retention_idx",
  "instrument_fundamental_history_retention_idx",
  "market_rss_translation_cache_retention_idx",
  "automation_notification_deliveries_retention_idx",
  "instrument_universe_sync_runs_retention_idx",
  "discord_delivery_queue_retention_idx",
  "market_rss_fetch_snapshots_retention_idx",
  "market_rss_articles_source_snapshot_idx",
  "sec_source_snapshots_key_fetched_idx",
  "intraday_detection_runs_finished_retention_idx",
  "instrument_candle_cache_retries_retention_idx",
  "daily_bollinger_cache_retries_retention_idx",
  "daily_cache_followup_retries_retention_idx",
];

if (process.env.OCI_PG_TERMINATION_APPROVED_PIDS !== APPROVED_PID_MARKER) {
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

const currentTargetsSql = `
  SELECT pid, backend_type, state, wait_event_type, wait_event,
    backend_xmin IS NOT NULL AS holds_snapshot,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid <> pg_backend_pid()
    AND pid = ANY($1::integer[])
  ORDER BY pid
`;

try {
  await client.connect();
  const [snapshotHolders, flyway168, invalidIndexes, createIndexProgress, current] = await Promise.all([
    client.query(`
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
    `),
    client.query(`
      SELECT version, success, installed_on, execution_time
      FROM flyway_schema_history
      WHERE version = '168'
      ORDER BY installed_rank DESC
      LIMIT 3
    `),
    client.query(`
      SELECT index_class.relname AS index_name
      FROM pg_index AS index_state
      JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid
      JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
      WHERE index_schema.nspname = current_schema()
        AND NOT index_state.indisvalid
        AND index_class.relname = ANY($1::text[])
      ORDER BY index_class.relname
    `, [V168_INDEX_NAMES]),
    client.query(`
      SELECT pid, relid::regclass::text AS table_name, index_relid::regclass::text AS index_name,
        command, phase, blocks_total, blocks_done, tuples_total, tuples_done
      FROM pg_stat_progress_create_index
      ORDER BY pid
    `),
    client.query(currentTargetsSql, [APPROVED_PIDS]),
  ]);

  console.log(JSON.stringify({
    diagnostic: true,
    approvedPids: APPROVED_PIDS,
    snapshotHolders: snapshotHolders.rows,
    flyway168: flyway168.rows,
    invalidV168Indexes: invalidIndexes.rows,
    createIndexProgress: createIndexProgress.rows,
    approvedTargets: current.rows,
  }));

  const eligiblePids = current.rows
    .filter((row) => row.backend_type === "client backend"
      && row.state === "active"
      && row.holds_snapshot === true
      && row.transaction_age_seconds >= MIN_TRANSACTION_AGE_SECONDS)
    .map(({ pid }) => pid);

  if (eligiblePids.length === 0) {
    console.log(JSON.stringify({ terminatedPids: [], remainingPids: [] }));
  } else {
    // Recheck the exact approved PIDs and all eligibility conditions in the
    // same statement that sends signals; unrelated sessions are never targeted.
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
      complete_eligible_set AS MATERIALIZED (
        SELECT ARRAY_AGG(pid ORDER BY pid) AS pids
        FROM candidates
        HAVING COUNT(*) = CARDINALITY($1::integer[])
      ),
      termination_results AS MATERIALIZED (
        SELECT target.pid, pg_terminate_backend(target.pid) AS terminated
        FROM complete_eligible_set
        CROSS JOIN LATERAL UNNEST(complete_eligible_set.pids) AS target(pid)
      )
      SELECT pid, terminated
      FROM termination_results
      ORDER BY pid
    `, [eligiblePids, MIN_TRANSACTION_AGE_SECONDS]);

    if (result.rows.length !== eligiblePids.length || result.rows.some(({ terminated }) => terminated !== true)) {
      console.log(JSON.stringify({ eligiblePids, terminationResults: result.rows }));
      throw new Error("PostgreSQL did not confirm termination for every still-eligible approved PID");
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

    console.log(JSON.stringify({ approvedPids: APPROVED_PIDS, eligiblePids, terminatedPids, remainingPids: remaining }));
    if (remaining.length > 0) throw new Error("One or more terminated PIDs remain in pg_stat_activity");
  }
} finally {
  await client.end().catch(() => undefined);
}
