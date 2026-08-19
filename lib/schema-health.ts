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
  "kr_instrument_universe",
  "us_instrument_universe",
  "kr_instrument_universe_candles",
  "us_instrument_universe_candles",
  "instrument_fundamental_snapshots",
  "kis_tokens",
  "kis_token_issuance_history",
] as const;

/** Tables removed by V70 and not allowed in the active architecture. */
export const RETIRED_SCHEMA_TABLES = ["kr_daily_price_candles", "us_daily_price_candles"] as const;

export type SchemaHealth = {
  connectionOk: boolean;
  schemaReady: boolean;
  flywayVersion: string | null;
  checkedTables: string[];
  missingTables: string[];
  operationalTables: string[];
  missingOperationalTables: string[];
  retiredTablesPresent: string[];
  latencyMs: number;
  error?: { errorCode: string; message: string; databaseCode?: string };
};

export function getMissingSchemaTables(tableNames: string[], requiredTables: readonly string[] = CORE_SCHEMA_TABLES) {
  const available = new Set(tableNames);
  return requiredTables.filter((table) => !available.has(table));
}

export async function inspectDatabaseSchema(): Promise<SchemaHealth> {
  const startedAt = Date.now();
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    const tableResult = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [OPERATIONAL_SCHEMA_TABLES],
    );
    const checkedTables = tableResult.rows.map((row) => row.table_name);
    const missingTables = getMissingSchemaTables(checkedTables);
    const missingOperationalTables = getMissingSchemaTables(checkedTables, OPERATIONAL_SCHEMA_TABLES);
    const retiredResult = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [RETIRED_SCHEMA_TABLES],
    );
    const retiredTablesPresent = retiredResult.rows.map((row) => row.table_name);
    let flywayVersion: string | null = null;
    if (!missingTables.includes("flyway_schema_history")) {
      const flywayResult = await pool.query<{ version: string }>("SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1");
      flywayVersion = flywayResult.rows[0]?.version || null;
    }
    return {
      connectionOk: true,
      schemaReady: missingOperationalTables.length === 0 && retiredTablesPresent.length === 0 && Boolean(flywayVersion),
      flywayVersion,
      checkedTables,
      missingTables,
      operationalTables: checkedTables.filter((table) => (OPERATIONAL_SCHEMA_TABLES as readonly string[]).includes(table)),
      missingOperationalTables,
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
      missingOperationalTables: [...OPERATIONAL_SCHEMA_TABLES],
      retiredTablesPresent: [],
      latencyMs: Date.now() - startedAt,
      error: { errorCode: diagnostics.errorCode, message: diagnostics.message, databaseCode: diagnostics.databaseCode },
    };
  }
}
