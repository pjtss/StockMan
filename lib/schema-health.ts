import { getPool } from "@/lib/db";
import { describeError } from "@/lib/error-diagnostics";

export const CORE_SCHEMA_TABLES = [
  "flyway_schema_history",
  "feature_module_settings",
  "automation_runs",
  "market_rss_articles",
  "sec_companies",
  "sec_submissions",
  "sec_filing_events",
  "sec_xbrl_snapshots",
] as const;

/** Tables required by the current domestic/overseas universe architecture. */
export const OPERATIONAL_SCHEMA_TABLES = [
  ...CORE_SCHEMA_TABLES,
  "kr_common_stock_universe",
  "us_common_stock_universe",
  "us_special_instrument_universe",
  "us_exchange_trading_status",
  "kr_instrument_universe_candles",
  "us_instrument_universe_candles",
  "us_obv_divergence_snapshot",
  "market_impact_events",
  "stockman_events",
  "stockman_event_documents",
  "stockman_event_analyses",
  "stockman_event_history",
  "stockman_event_metrics",
  "instrument_fundamental_snapshots",
  "instrument_fundamental_refresh_jobs",
  "instrument_fundamental_refresh_items",
  "intraday_turnover_observations",
  "kis_tokens",
  "kis_token_issuance_history",
  "debug_run_items",
  "debug_kis_calls",
  "kis_rate_limit_events",
  "user_watchlist",
] as const;

/** Compatibility views retained for legacy read paths. */
export const OPERATIONAL_SCHEMA_VIEWS = ["kr_instrument_universe", "us_instrument_universe"] as const;

// Older required table migrations can be skipped when deployments start from a
// later Flyway version. Keep forward-edge reassertions explicit and audited.
export const FORWARD_REQUIRED_OPERATIONAL_TABLES = ["kis_rate_limit_events"] as const;

export const FORWARD_REQUIRED_OPERATIONAL_INDEXES = [
  ["kis_rate_limit_events_occurred_idx", "kis_rate_limit_events", "occurred_at DESC"],
  ["kis_rate_limit_events_endpoint_idx", "kis_rate_limit_events", "endpoint, occurred_at DESC"],
  ["kis_rate_limit_events_incident_idx", "kis_rate_limit_events", "incident_id, occurred_at DESC"],
] as const;

export function buildOperationalIndexIntegrityQuery() {
  const select = `SELECT required.index_name, required.table_name, required.expected_columns,
                         expected_table.oid IS NOT NULL AS expected_table_exists,
                         index_relation.relname AS actual_index_name,
                         indexed_table.relname AS actual_table_name,
                         index_definition.actual_columns,
                         access_method.amname AS access_method,
                         index_state.indisunique AS is_unique,
                         index_state.indisexclusion AS is_exclusion,
                         index_state.indisvalid AS is_valid,
                         index_state.indisready AS is_ready,
                         index_state.indislive AS is_live,
                         index_state.indpred IS NOT NULL AS has_predicate,
                         index_state.indexprs IS NOT NULL AS has_expressions,
                         index_state.indnkeyatts::int AS key_attribute_count,
                         index_state.indnatts::int AS attribute_count
                  FROM unnest($1::text[], $2::text[], $3::text[])
                       AS required(index_name, table_name, expected_columns)
                  LEFT JOIN pg_namespace expected_namespace ON expected_namespace.nspname = 'public'
                  LEFT JOIN pg_class expected_table ON expected_table.relnamespace = expected_namespace.oid
                                                   AND expected_table.relname = required.table_name
                                                   AND expected_table.relkind IN ('r', 'p')
                  LEFT JOIN pg_class index_relation ON index_relation.relnamespace = expected_namespace.oid
                                                   AND index_relation.relname = required.index_name
                                                   AND index_relation.relkind IN ('i', 'I')
                  LEFT JOIN pg_index index_state ON index_state.indexrelid = index_relation.oid
                  LEFT JOIN pg_class indexed_table ON indexed_table.oid = index_state.indrelid
                  LEFT JOIN pg_am access_method ON access_method.oid = index_relation.relam
                  LEFT JOIN LATERAL (
                    SELECT string_agg(
                      pg_get_indexdef(index_relation.oid, indexed_column.ordinal::int, false)
                      || CASE WHEN pg_index_column_has_property(index_relation.oid, indexed_column.ordinal::int, 'desc') THEN ' DESC' ELSE '' END,
                      ', ' ORDER BY indexed_column.ordinal
                    ) AS actual_columns
                    FROM generate_series(1, index_state.indnatts::int) AS indexed_column(ordinal)
                  ) AS index_definition ON TRUE`;
  const integrityWhere = `WHERE index_integrity.expected_table_exists IS DISTINCT FROM TRUE
       OR index_integrity.actual_index_name IS NULL
       OR index_integrity.actual_table_name IS DISTINCT FROM index_integrity.table_name
       OR lower(regexp_replace(btrim(translate(index_integrity.actual_columns, chr(34), '')), '[[:space:]]+', ' ', 'g'))
          IS DISTINCT FROM lower(regexp_replace(btrim(index_integrity.expected_columns), '[[:space:]]+', ' ', 'g'))
       OR index_integrity.access_method IS DISTINCT FROM 'btree'
       OR index_integrity.is_unique IS DISTINCT FROM FALSE
       OR index_integrity.is_exclusion IS DISTINCT FROM FALSE
       OR index_integrity.is_valid IS DISTINCT FROM TRUE
       OR index_integrity.is_ready IS DISTINCT FROM TRUE
       OR index_integrity.is_live IS DISTINCT FROM TRUE
       OR index_integrity.has_predicate IS DISTINCT FROM FALSE
       OR index_integrity.has_expressions IS DISTINCT FROM FALSE
       OR index_integrity.key_attribute_count IS DISTINCT FROM index_integrity.attribute_count`;
  return {
    text: `SELECT index_integrity.* FROM (${select}) AS index_integrity ${integrityWhere}`,
    values: [
      FORWARD_REQUIRED_OPERATIONAL_INDEXES.map(([name]) => name),
      FORWARD_REQUIRED_OPERATIONAL_INDEXES.map(([, table]) => table),
      FORWARD_REQUIRED_OPERATIONAL_INDEXES.map(([, , columns]) => columns),
    ],
  };
}

/** Tables removed by V70 and not allowed in the active architecture. */
export const RETIRED_SCHEMA_TABLES = ["kr_daily_price_candles", "us_daily_price_candles"] as const;

export const KIS_RATE_LIMIT_EVENT_REQUIRED_COLUMNS = [
  ["kis_rate_limit_events", "id"],
  ["kis_rate_limit_events", "run_id"],
  ["kis_rate_limit_events", "tick_id"],
  ["kis_rate_limit_events", "request_id"],
  ["kis_rate_limit_events", "endpoint"],
  ["kis_rate_limit_events", "market"],
  ["kis_rate_limit_events", "tr_id"],
  ["kis_rate_limit_events", "http_status"],
  ["kis_rate_limit_events", "kis_rt_cd"],
  ["kis_rate_limit_events", "kis_msg_cd"],
  ["kis_rate_limit_events", "kis_msg1_code"],
  ["kis_rate_limit_events", "limit_type"],
  ["kis_rate_limit_events", "limit_scope"],
  ["kis_rate_limit_events", "observed_tps"],
  ["kis_rate_limit_events", "configured_tps"],
  ["kis_rate_limit_events", "retry_after_ms"],
  ["kis_rate_limit_events", "backoff_ms"],
  ["kis_rate_limit_events", "attempt"],
  ["kis_rate_limit_events", "breaker_state"],
  ["kis_rate_limit_events", "queued_count"],
  ["kis_rate_limit_events", "inflight_count"],
  ["kis_rate_limit_events", "budget_remaining"],
  ["kis_rate_limit_events", "incident_id"],
  ["kis_rate_limit_events", "occurred_at"],
  ["kis_rate_limit_events", "recovered_at"],
  ["kis_rate_limit_events", "recovery_status"],
] as const;

/** PostgreSQL information_schema column shape expected by the event writer and readers. */
export const KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES = [
  ["id", "bigint", "NO", true],
  ["run_id", "text", "YES", false],
  ["tick_id", "text", "YES", false],
  ["request_id", "text", "NO", false],
  ["endpoint", "text", "NO", false],
  ["market", "text", "YES", false],
  ["tr_id", "text", "NO", false],
  ["http_status", "integer", "YES", false],
  ["kis_rt_cd", "text", "YES", false],
  ["kis_msg_cd", "text", "YES", false],
  ["kis_msg1_code", "text", "YES", false],
  ["limit_type", "text", "NO", false],
  ["limit_scope", "text", "NO", false],
  ["observed_tps", "numeric", "YES", false],
  ["configured_tps", "numeric", "NO", true],
  ["retry_after_ms", "integer", "YES", false],
  ["backoff_ms", "integer", "YES", false],
  ["attempt", "integer", "NO", true],
  ["breaker_state", "text", "YES", false],
  ["queued_count", "integer", "YES", false],
  ["inflight_count", "integer", "YES", false],
  ["budget_remaining", "numeric", "YES", false],
  ["incident_id", "text", "NO", false],
  ["occurred_at", "timestamp with time zone", "NO", true],
  ["recovered_at", "timestamp with time zone", "YES", false],
  ["recovery_status", "text", "YES", false],
] as const;

export function buildOperationalPrimaryKeyIntegrityQuery() {
  return {
    text: `SELECT required.table_name, required.column_name,
                  primary_key_constraint.conname AS constraint_name,
                  primary_key_definition.first_column_name,
                  primary_key_definition.key_column_count
           FROM unnest($1::text[], $2::text[]) AS required(table_name, column_name)
           LEFT JOIN pg_namespace AS relation_namespace ON relation_namespace.nspname = 'public'
           LEFT JOIN pg_class AS relation
             ON relation.relnamespace = relation_namespace.oid
            AND relation.relname = required.table_name
            AND relation.relkind IN ('r', 'p')
           LEFT JOIN pg_constraint AS primary_key_constraint
             ON primary_key_constraint.conrelid = relation.oid
            AND primary_key_constraint.contype = 'p'
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::integer AS key_column_count,
                    MAX(key_attribute.attname) FILTER (WHERE key_column.ordinal_position = 1) AS first_column_name
             FROM unnest(primary_key_constraint.conkey) WITH ORDINALITY AS key_column(attribute_number, ordinal_position)
             JOIN pg_attribute AS key_attribute
               ON key_attribute.attrelid = relation.oid
              AND key_attribute.attnum = key_column.attribute_number
              AND key_attribute.attisdropped = FALSE
           ) AS primary_key_definition ON primary_key_constraint.oid IS NOT NULL
           WHERE relation.oid IS NOT NULL
             AND (primary_key_constraint.oid IS NULL OR primary_key_definition.first_column_name IS DISTINCT FROM required.column_name OR primary_key_definition.key_column_count IS DISTINCT FROM 1)`,
    values: [["kis_rate_limit_events"], ["id"]],
  };
}

export const REQUIRED_OPERATIONAL_COLUMNS = [
  ["kr_common_stock_universe", "daily_active"],
  ["us_common_stock_universe", "daily_active"],
  ["market_rss_articles", "translation_attempted_at"],
  ["market_rss_articles", "translation_candidate_title"],
  ["market_rss_articles", "normalized_summary"],
] as const;

/** Columns introduced below the production Flyway floor need a forward-edge repair migration. */
export const FORWARD_REQUIRED_OPERATIONAL_COLUMNS = [
  ["market_rss_articles", "translation_attempted_at"],
  ["market_rss_articles", "translation_candidate_title"],
  ["market_rss_articles", "normalized_summary"],
] as const;

export type SchemaHealth = {
  connectionOk: boolean;
  schemaReady: boolean;
  flywayVersion: string | null;
  checkedTables: string[];
  missingTables: string[];
  operationalTables: string[];
  operationalViews: string[];
  missingOperationalViews: string[];
  missingOperationalTables: string[];
  missingOperationalColumns: string[];
  operationalColumnShapeIssues: string[];
  operationalPrimaryKeyIssues: string[];
  operationalIndexIssues: string[];
  retiredTablesPresent: string[];
  latencyMs: number;
  error?: { errorCode: string; message: string; databaseCode?: string };
};

export function getMissingSchemaTables(tableNames: string[], requiredTables: readonly string[] = CORE_SCHEMA_TABLES) {
  const available = new Set(tableNames);
  return requiredTables.filter((table) => !available.has(table));
}

export function getMissingSchemaColumns(
  requiredColumns: readonly (readonly [string, string])[],
  availableColumns: readonly (readonly [string, string])[],
) {
  const available = new Set(availableColumns.map(([table, column]) => `${table}.${column}`));
  return requiredColumns
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !available.has(column));
}

export function getOperationalColumnShapeIssues(
  requiredShapes: readonly (readonly [string, string, string, boolean])[],
  availableColumns: readonly { table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }[],
  tableName = "kis_rate_limit_events",
) {
  const available = new Map(availableColumns.map((column) => [`${column.table_name}.${column.column_name}`, column]));
  return requiredShapes.flatMap(([columnName, expectedType, expectedNullable, requiresDefault]) => {
    const actual = available.get(`${tableName}.${columnName}`);
    if (!actual) return [];
    const reasons = [];
    if (actual.data_type.toLowerCase() !== expectedType) reasons.push("wrong_type");
    if (actual.is_nullable !== expectedNullable) reasons.push("wrong_nullability");
    if (requiresDefault && actual.column_default === null) reasons.push("missing_default");
    return reasons.length ? [`${tableName}.${columnName}:${reasons.join("+")}`] : [];
  });
}

export function getOperationalIndexIssues(rows: Array<{
  index_name: string;
  table_name: string;
  expected_columns: string;
  expected_table_exists: boolean;
  actual_index_name: string | null;
  actual_table_name: string | null;
  actual_columns: string | null;
  access_method: string | null;
  is_unique: boolean | null;
  is_exclusion: boolean | null;
  is_valid: boolean | null;
  is_ready: boolean | null;
  is_live: boolean | null;
  has_predicate: boolean | null;
  has_expressions: boolean | null;
  key_attribute_count: number | null;
  attribute_count: number | null;
}>) {
  return rows.flatMap((row) => {
    if (!row.expected_table_exists) return [`${row.index_name}:table_missing`];
    if (!row.actual_index_name) return [`${row.index_name}:missing`];
    const reasons = [];
    if (row.actual_table_name !== row.table_name) reasons.push("wrong_table");
    if ((row.actual_columns ?? "").replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase()
      !== row.expected_columns.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase()) reasons.push("wrong_columns");
    if (row.access_method !== "btree") reasons.push("wrong_access_method");
    if (row.is_unique !== false) reasons.push("unexpected_uniqueness");
    if (row.is_exclusion !== false) reasons.push("unexpected_exclusion");
    if (row.is_valid !== true) reasons.push("invalid");
    if (row.is_ready !== true) reasons.push("not_ready");
    if (row.is_live !== true) reasons.push("not_live");
    if (row.has_predicate !== false) reasons.push("unexpected_predicate");
    if (row.has_expressions !== false) reasons.push("unexpected_expression");
    if (row.key_attribute_count !== row.attribute_count) reasons.push("unexpected_included_columns");
    return reasons.length ? [`${row.index_name}:${reasons.join("+")}`] : [];
  });
}

export async function inspectDatabaseSchema(pool = getPool()): Promise<SchemaHealth> {
  const startedAt = Date.now();
  try {
    const indexIntegrityQuery = buildOperationalIndexIntegrityQuery();
    const primaryKeyIntegrityQuery = buildOperationalPrimaryKeyIntegrityQuery();
    const [connectionResult, tableResult, viewResult, columnResult, primaryKeyResult, indexResult, retiredResult] = await Promise.all([
      pool.query("SELECT 1"),
      pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])",
        [OPERATIONAL_SCHEMA_TABLES],
      ),
      pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW' AND table_name = ANY($1::text[])",
        [OPERATIONAL_SCHEMA_VIEWS],
      ),
      pool.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
        "SELECT available.table_name, available.column_name, available.data_type, available.is_nullable, available.column_default FROM information_schema.columns AS available WHERE available.table_schema = 'public' AND available.table_name = ANY($1::text[]) AND EXISTS (SELECT 1 FROM information_schema.tables AS relation WHERE relation.table_schema = available.table_schema AND relation.table_name = available.table_name AND relation.table_type = 'BASE TABLE')",
        [[...new Set(REQUIRED_OPERATIONAL_COLUMNS.map(([table]) => table))]],
      ),
      pool.query<{ table_name: string; column_name: string; constraint_name: string | null; first_column_name: string | null; key_column_count: number | null }>(
        primaryKeyIntegrityQuery.text,
        primaryKeyIntegrityQuery.values,
      ),
      pool.query<Parameters<typeof getOperationalIndexIssues>[0][number]>(
        indexIntegrityQuery.text,
        indexIntegrityQuery.values,
      ),
      pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
        [RETIRED_SCHEMA_TABLES],
      ),
    ]);
    void connectionResult;
    const checkedTables = tableResult.rows.map((row) => row.table_name);
    const missingTables = getMissingSchemaTables(checkedTables);
    const missingOperationalTables = getMissingSchemaTables(checkedTables, OPERATIONAL_SCHEMA_TABLES);
    const operationalViews = viewResult.rows.map((row) => row.table_name);
    const missingOperationalViews = getMissingSchemaTables(operationalViews, OPERATIONAL_SCHEMA_VIEWS);
    const requiredColumnsForExistingTables = REQUIRED_OPERATIONAL_COLUMNS.filter(([table]) => checkedTables.includes(table));
    const missingOperationalColumns = getMissingSchemaColumns(
      requiredColumnsForExistingTables,
      columnResult.rows.map((row) => [row.table_name, row.column_name] as const),
    );
    const operationalColumnShapeIssues = getOperationalColumnShapeIssues(
      KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES,
      columnResult.rows,
    );
    const operationalPrimaryKeyIssues = primaryKeyResult.rows.map((row) => `${row.table_name}.${row.column_name}:primary_key_invalid`);
    const operationalIndexIssues = getOperationalIndexIssues(indexResult.rows);
    const retiredTablesPresent = retiredResult.rows.map((row) => row.table_name);
    let flywayVersion: string | null = null;
    if (!missingTables.includes("flyway_schema_history")) {
      const flywayResult = await pool.query<{ version: string }>("SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1");
      flywayVersion = flywayResult.rows[0]?.version || null;
    }
    return {
      connectionOk: true,
      schemaReady: missingOperationalTables.length === 0 && missingOperationalViews.length === 0 && missingOperationalColumns.length === 0 && operationalColumnShapeIssues.length === 0 && operationalPrimaryKeyIssues.length === 0 && operationalIndexIssues.length === 0 && retiredTablesPresent.length === 0 && Boolean(flywayVersion),
      flywayVersion,
      checkedTables,
      missingTables,
      operationalTables: checkedTables.filter((table) => (OPERATIONAL_SCHEMA_TABLES as readonly string[]).includes(table)),
      operationalViews,
      missingOperationalViews,
      missingOperationalTables,
      missingOperationalColumns,
      operationalColumnShapeIssues,
      operationalPrimaryKeyIssues,
      operationalIndexIssues,
      retiredTablesPresent,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const diagnostics = describeError(error);
    return {
      connectionOk: false,
      schemaReady: false,
      flywayVersion: null,
      checkedTables: [],
      missingTables: [...CORE_SCHEMA_TABLES],
      operationalTables: [],
      operationalViews: [],
      missingOperationalViews: [...OPERATIONAL_SCHEMA_VIEWS],
      missingOperationalTables: [...OPERATIONAL_SCHEMA_TABLES],
      missingOperationalColumns: REQUIRED_OPERATIONAL_COLUMNS.map(([table, column]) => `${table}.${column}`),
      operationalColumnShapeIssues: KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES.map(([column]) => `kis_rate_limit_events.${column}:unknown`),
      operationalPrimaryKeyIssues: [`kis_rate_limit_events.id:unknown`],
      operationalIndexIssues: FORWARD_REQUIRED_OPERATIONAL_INDEXES.map(([name]) => `${name}:unknown`),
      retiredTablesPresent: [],
      latencyMs: Date.now() - startedAt,
      error: { errorCode: diagnostics.errorCode, message: diagnostics.message, databaseCode: diagnostics.databaseCode },
    };
  }
}
