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

export type SchemaHealth = {
  connectionOk: boolean;
  schemaReady: boolean;
  flywayVersion: string | null;
  checkedTables: string[];
  missingTables: string[];
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
      [CORE_SCHEMA_TABLES],
    );
    const checkedTables = tableResult.rows.map((row) => row.table_name);
    const missingTables = getMissingSchemaTables(checkedTables);
    let flywayVersion: string | null = null;
    if (!missingTables.includes("flyway_schema_history")) {
      const flywayResult = await pool.query<{ version: string }>("SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1");
      flywayVersion = flywayResult.rows[0]?.version || null;
    }
    return {
      connectionOk: true,
      schemaReady: missingTables.length === 0 && Boolean(flywayVersion),
      flywayVersion,
      checkedTables,
      missingTables,
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
      latencyMs: Date.now() - startedAt,
      error: { errorCode: diagnostics.errorCode, message: diagnostics.message, databaseCode: diagnostics.databaseCode },
    };
  }
}
