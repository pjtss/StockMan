import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { inspectDatabaseSchema } from "@/lib/schema-health";
import { auditFlywayDdlInventory, auditFlywayHistory, auditUniverseSplitPreconditions, parseFlywayMigrationFiles, type FlywayHistoryRecord } from "@/lib/flyway-history-audit";

async function main() {
  loadLocalEnv({ required: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const databaseHost = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
    throw new Error(`Refusing to audit a non-local database host: ${databaseHost}`);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const history = await pool.query<FlywayHistoryRecord>(
      "SELECT version, success, script FROM public.flyway_schema_history ORDER BY installed_rank",
    );
    const files = parseFlywayMigrationFiles(readdirSync(resolve(process.cwd(), "db/migration")));
    const report = auditFlywayHistory(history.rows, files);
    const migrationSql = files.map((file) => ({
      ...file,
      sql: readFileSync(resolve(process.cwd(), "db/migration", file.filename), "utf8"),
    }));
    const relationSnapshot = await pool.query<{ table_name: string; relation_kind: string | null; estimated_rows: string | null }>(
      `SELECT requested.table_name,
              cls.relkind::text AS relation_kind,
              CASE WHEN cls.reltuples >= 0 THEN cls.reltuples::bigint::text ELSE NULL END AS estimated_rows
       FROM unnest($1::text[]) AS requested(table_name)
       LEFT JOIN pg_class cls ON cls.oid = to_regclass(format('public.%I', requested.table_name))`,
      [[
        "kr_instrument_universe", "kr_instrument_universe_candles", "kr_common_stock_universe", "kr_special_instrument_universe",
        "us_instrument_universe", "us_instrument_universe_candles", "us_common_stock_universe", "us_special_instrument_universe", "us_instrument_universe_legacy",
      ]],
    );
    const splitPreflight = auditUniverseSplitPreconditions(relationSnapshot.rows.map((row) => ({
      tableName: row.table_name,
      relationKind: row.relation_kind,
      estimatedRows: row.estimated_rows === null ? null : Number(row.estimated_rows),
    })));
    const schemaHealth = await inspectDatabaseSchema(pool);
    const [catalogRelations, catalogColumns, catalogConstraints] = await Promise.all([
      pool.query<{ name: string; kind: string }>(
        "SELECT c.relname AS name, c.relkind::text AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'",
      ),
      pool.query<{ table_name: string; column_name: string }>(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
      ),
      pool.query<{ table_name: string; name: string }>(
        "SELECT relation.relname AS table_name, constraint_row.conname AS name FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid = constraint_row.conrelid JOIN pg_namespace namespace_row ON namespace_row.oid = relation.relnamespace WHERE namespace_row.nspname = 'public'",
      ),
    ]);
    const ddlInventory = auditFlywayDdlInventory(migrationSql, {
      relations: catalogRelations.rows,
      columns: catalogColumns.rows.map((row) => ({ tableName: row.table_name, columnName: row.column_name })),
      constraints: catalogConstraints.rows.map((row) => ({ tableName: row.table_name, name: row.name })),
    });
    console.info(`[flyway-history-audit] ${JSON.stringify({
      databaseHost,
      readOnly: true,
      appliedLatest: report.appliedLatest,
      sourceLatest: report.sourceLatest,
      appliedMigrationCount: report.appliedMigrationCount,
      sourceMigrationCount: report.sourceMigrationCount,
      pendingCount: report.pending.length,
      pendingSample: report.pending.slice(0, 10).map(({ version, filename }) => ({ version, filename })),
      failed: report.failed.map(({ version, script }) => ({ version, script })),
      drift: report.drift,
      splitMigrationPreflight: splitPreflight,
      preflightNote: "Structural checks only; not approval to execute migrations. Row estimates are approximate. V85/V89 delete or rename data relations.",
      operationalSchema: {
        ready: schemaHealth.schemaReady,
        missingOperationalTables: schemaHealth.missingOperationalTables,
        missingOperationalColumns: schemaHealth.missingOperationalColumns,
        retiredTablesPresent: schemaHealth.retiredTablesPresent,
      },
      ddlInventory,
    })}`);
    if (report.drift) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[flyway-history-audit-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
