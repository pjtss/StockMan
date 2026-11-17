import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { inspectDatabaseSchema } from "@/lib/schema-health";
import { auditAppliedFlywayMigrationValidation, auditFlywayDdlInventory, auditFlywayHistory, auditFlywayIndexTargetsAgainstSourceHistory, auditUniverseSplitPreconditions, classifyFlywayMigrationState, compareFlywayCheckExpressions, extractFlywayCheckExpression, findFlywayColumnDropForeignKeyDependencyIssues, findFlywayColumnDropForeignKeyDependents, findFlywayConcurrentIndexTransactionBlockStatementStarts, findFlywayDomainCascadeDropEffects, findFlywayDropOwnedEffects, findFlywayIndexConstraintOwner, findFlywayIndexForeignKeyDependents, findFlywayOwningUniqueConstraint, findFlywayRelationCreationSourceBeforeVersion, findFlywayRelationDropForeignKeyDependencyIssues, findFlywaySchemaDropEffects, findFlywaySchemaRenameEffects, findFlywayTypeCascadeDropEffects, findFlywayUnmodeledAlterUniqueKeyEffects, findFlywayUniqueConstraintDropForeignKeyDependencyIssues, hasExplicitNonTransactionalFlywayScriptConfig, hasFlywayConcurrentIndexOperation, isFlywayIndexDefinitionVerified, isFlywayIndexNameConflict, matchesFlywayForeignKeyTargetKey, normalizeFlywayIdentifier, parseFlywayCreateTableColumns, parseFlywayCreateTableSpecialDefinitions, parseFlywayDdlEffects, parseFlywayIndexKeyTerms, parseFlywayMigrationFiles, removeFlywayUniqueKeysForDroppedConstraint, renameFlywayUniqueConstraintKey, type FlywayAvailableUniqueKey, type FlywayHistoryRecord, type FlywayIndexConstraintOwner, type FlywayIndexForeignKeyDependent } from "@/lib/flyway-history-audit";

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
      "SELECT version, success, script, description, type, checksum FROM public.flyway_schema_history ORDER BY installed_rank",
    );
    const migrationDirectory = resolve(process.cwd(), "db/migration");
    const migrationDirectoryEntries = new Set(readdirSync(migrationDirectory));
    const files = parseFlywayMigrationFiles([...migrationDirectoryEntries]);
    const report = auditFlywayHistory(history.rows, files);
    const migrationSql = files.map((file) => ({
      ...file,
      sql: readFileSync(resolve(process.cwd(), "db/migration", file.filename), "utf8"),
    }));
    const migrationValidation = auditAppliedFlywayMigrationValidation(history.rows, migrationSql);
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
    const [catalogRelations, catalogColumns, catalogConstraints, catalogIndexParents] = await Promise.all([
      pool.query<{ name: string; kind: string }>(
        "SELECT c.relname AS name, c.relkind::text AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'",
      ),
      pool.query<{ table_name: string; column_name: string }>(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
      ),
      pool.query<{ table_name: string; name: string; constraint_type: string; key_columns: string[]; is_deferrable: boolean; initially_deferred: boolean; is_validated: boolean; no_inherit: boolean; referenced_table: string | null; referenced_columns: string[]; match_type: string | null; on_delete: string | null; on_update: string | null; on_delete_columns: string[] | null; constraint_definition: string; nulls_not_distinct: boolean; included_columns: string[]; backing_index_name: string | null }>(
        "SELECT relation.relname AS table_name, constraint_row.conname AS name, constraint_row.contype::text AS constraint_type, ARRAY(SELECT attribute.attname::text FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinal_position) JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key_column.attnum ORDER BY key_column.ordinal_position) AS key_columns, constraint_row.condeferrable AS is_deferrable, constraint_row.condeferred AS initially_deferred, constraint_row.convalidated AS is_validated, constraint_row.connoinherit AS no_inherit, referenced_relation.relname AS referenced_table, ARRAY(SELECT referenced_attribute.attname::text FROM unnest(constraint_row.confkey) WITH ORDINALITY AS referenced_key(attnum, ordinal_position) JOIN pg_attribute referenced_attribute ON referenced_attribute.attrelid = constraint_row.confrelid AND referenced_attribute.attnum = referenced_key.attnum ORDER BY referenced_key.ordinal_position) AS referenced_columns, constraint_row.confmatchtype::text AS match_type, constraint_row.confdeltype::text AS on_delete, constraint_row.confupdtype::text AS on_update, ARRAY(SELECT local_attribute.attname::text FROM unnest(constraint_row.confdelsetcols) WITH ORDINALITY AS set_column(attnum, ordinal_position) JOIN pg_attribute local_attribute ON local_attribute.attrelid = constraint_row.conrelid AND local_attribute.attnum = set_column.attnum ORDER BY set_column.ordinal_position) AS on_delete_columns, pg_get_constraintdef(constraint_row.oid, false) AS constraint_definition, COALESCE(index_row.indnullsnotdistinct, false) AS nulls_not_distinct, ARRAY(SELECT included_attribute.attname::text FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS included_key(attnum, ordinal_position) JOIN pg_attribute included_attribute ON included_attribute.attrelid = constraint_row.conrelid AND included_attribute.attnum = included_key.attnum WHERE included_key.ordinal_position > index_row.indnkeyatts ORDER BY included_key.ordinal_position) AS included_columns, backing_index.relname AS backing_index_name FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid = constraint_row.conrelid JOIN pg_namespace namespace_row ON namespace_row.oid = relation.relnamespace LEFT JOIN pg_class referenced_relation ON referenced_relation.oid = constraint_row.confrelid LEFT JOIN pg_index index_row ON index_row.indexrelid = constraint_row.conindid LEFT JOIN pg_class backing_index ON backing_index.oid = constraint_row.conindid WHERE namespace_row.nspname = 'public'",
      ),
      pool.query<{ index_name: string; table_name: string; index_definition: string; is_unique: boolean; access_method: string; has_predicate: boolean; predicate_expression: string | null; is_valid: boolean; is_ready: boolean; is_live: boolean; nulls_not_distinct: boolean; include_columns: string[] }>(
        "SELECT index_relation.relname AS index_name, table_relation.relname AS table_name, pg_get_indexdef(index_row.indexrelid) AS index_definition, index_row.indisunique AS is_unique, access_method.amname AS access_method, index_row.indpred IS NOT NULL AS has_predicate, pg_get_expr(index_row.indpred, index_row.indrelid, false) AS predicate_expression, index_row.indisvalid AS is_valid, index_row.indisready AS is_ready, index_row.indislive AS is_live, index_row.indnullsnotdistinct AS nulls_not_distinct, ARRAY(SELECT included_attribute.attname::text FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS included_key(attnum, ordinal_position) JOIN pg_attribute included_attribute ON included_attribute.attrelid = table_relation.oid AND included_attribute.attnum = included_key.attnum WHERE included_key.ordinal_position > index_row.indnkeyatts ORDER BY included_key.ordinal_position) AS include_columns FROM pg_index index_row JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid JOIN pg_namespace namespace_row ON namespace_row.oid = index_relation.relnamespace JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid JOIN pg_am access_method ON access_method.oid = index_relation.relam WHERE namespace_row.nspname = 'public'",
      ),
    ]);
    const ddlInventory = auditFlywayDdlInventory(migrationSql, {
      relations: catalogRelations.rows,
      columns: catalogColumns.rows.map((row) => ({ tableName: row.table_name, columnName: row.column_name })),
      constraints: catalogConstraints.rows.map((row) => ({ tableName: row.table_name, name: row.name })),
    });
    const catalogRelationKinds = new Map(catalogRelations.rows.map((row) => [row.name, row.kind]));
    const catalogIndexParentByName = new Map(catalogIndexParents.rows.map((row) => [row.index_name, row.table_name]));
    const availableCatalogIndexByName = new Map(catalogIndexParents.rows.map((row) => [row.index_name, row]));
    const catalogForeignKeysByTable = new Map<string, typeof catalogConstraints.rows>();
    for (const constraint of catalogConstraints.rows) {
      if (constraint.constraint_type !== "f") continue;
      const table = constraint.table_name;
      const foreignKeys = catalogForeignKeysByTable.get(table) ?? [];
      foreignKeys.push(constraint);
      catalogForeignKeysByTable.set(table, foreignKeys);
    }
    const availableUniqueKeysByTable = new Map<string, FlywayAvailableUniqueKey[]>();
    const availableExclusionIndexOwners: FlywayIndexConstraintOwner[] = catalogConstraints.rows
      .filter((constraint) => constraint.constraint_type === "x" && constraint.backing_index_name !== null)
      .map((constraint) => ({ indexName: constraint.backing_index_name!, tableName: constraint.table_name, constraintName: constraint.name }));
    const availableForeignKeyIndexDependents: FlywayIndexForeignKeyDependent[] = catalogConstraints.rows
      .filter((constraint) => constraint.constraint_type === "f" && constraint.backing_index_name !== null)
      .map((constraint) => ({ indexName: constraint.backing_index_name!, tableName: constraint.table_name, constraintName: constraint.name, referencedTable: constraint.referenced_table ?? undefined, localColumns: constraint.key_columns, referencedColumns: constraint.referenced_columns }));
    for (const constraint of catalogConstraints.rows) {
      if (constraint.constraint_type !== "p" && constraint.constraint_type !== "u") continue;
      const table = constraint.table_name;
      const keys = availableUniqueKeysByTable.get(table) ?? [];
      keys.push({
        columns: constraint.key_columns,
        primary: constraint.constraint_type === "p",
        deferrable: constraint.is_deferrable,
        initiallyDeferred: constraint.initially_deferred,
        nullsNotDistinct: constraint.nulls_not_distinct,
        includeColumns: constraint.included_columns,
        constraintName: constraint.name,
        ...(constraint.backing_index_name ? { backingIndexName: constraint.backing_index_name } : {}),
      });
      availableUniqueKeysByTable.set(table, keys);
    }
    for (const index of catalogIndexParents.rows) {
      if (!index.is_unique || index.has_predicate || !index.is_valid || !index.is_ready || !index.is_live) continue;
      const keyList = index.index_definition.match(/\bUSING\s+[\w"]+\s*\(([^()]*)\)/i)?.[1];
      const keyTerms = keyList === undefined ? null : parseFlywayIndexKeyTerms(keyList);
      if (!keyTerms) continue;
      const table = index.table_name;
      const keys = availableUniqueKeysByTable.get(table) ?? [];
      keys.push({ columns: keyTerms.map(({ column }) => column), primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: index.nulls_not_distinct, includeColumns: [], indexName: index.index_name });
      availableUniqueKeysByTable.set(table, keys);
    }
    const invalidCatalogIndexes = catalogIndexParents.rows
      .filter((row) => !row.is_valid || !row.is_ready || !row.is_live)
      .map((row) => ({
        indexName: row.index_name,
        tableName: row.table_name,
        isValid: row.is_valid,
        isReady: row.is_ready,
        isLive: row.is_live,
      }));
    const pendingVersions = new Set(report.pending.map(({ version }) => version));
    const pendingIndexTargetsDroppedBySourceHistory = auditFlywayIndexTargetsAgainstSourceHistory(migrationSql)
      .filter(({ version }) => pendingVersions.has(version));
    const pendingConcurrentIndexConfigIssues = migrationSql.flatMap((migration) => {
      if (!pendingVersions.has(migration.version) || !hasFlywayConcurrentIndexOperation(migration)) return [];
      const configFilename = `${migration.filename}.conf`;
      const config = migrationDirectoryEntries.has(configFilename)
        ? readFileSync(resolve(migrationDirectory, configFilename), "utf8")
        : "";
      if (hasExplicitNonTransactionalFlywayScriptConfig(config)) return [];
      return [{ version: migration.version, filename: migration.filename, configFilename }];
    });
    const pendingConcurrentIndexTransactionBlockIssues = migrationSql.flatMap((migration) => {
      if (!pendingVersions.has(migration.version)) return [];
      return findFlywayConcurrentIndexTransactionBlockStatementStarts(migration)
        .map((statementStart) => ({ version: migration.version, filename: migration.filename, statementStart }));
    });
    const initialPhysicalRelations = new Set(catalogRelations.rows
      .filter(({ kind }) => kind === "r" || kind === "p")
      .map(({ name }) => name));
    const availablePhysicalRelations = new Set(initialPhysicalRelations);
    const availableIndexableRelations = new Set(catalogRelations.rows
      .filter(({ kind }) => kind === "r" || kind === "p" || kind === "m")
      .map(({ name }) => name));
    const availableColumnsByTable = new Map<string, Set<string>>();
    for (const { table_name, column_name } of catalogColumns.rows) {
      const table = table_name;
      const columns = availableColumnsByTable.get(table) ?? new Set<string>();
      columns.add(column_name);
      availableColumnsByTable.set(table, columns);
    }
    const availableConstraintNames = new Set(catalogConstraints.rows.map(({ table_name, name }) =>
      table_name + "." + name,
    ));
    const pendingIndexTargetIssues: Array<{ version: string; filename: string; indexName: string; targetTable: string; actualParentKind: string | null; sourceCreatorVersion: string | null; sourceCreatorFilename: string | null; sourceCreatorRelationType: "table" | "view" | "materialized_view" | null; sourceCreatorMigrationState: string | null }> = [];
    const pendingIndexTargetSchemaUnverified: Array<{ version: string; filename: string; indexName: string; targetSchema: string; targetTable: string; reason: string }> = [];
    const pendingIndexSchemaUnverified: Array<{ version: string; filename: string; indexName: string; targetSchema: string; reason: string }> = [];
    const pendingIndexTargetCreatorOlderUnappliedIssues: Array<{ version: string; filename: string; indexName: string; targetTable: string; creatorVersion: string; creatorFilename: string }> = [];
    const pendingIndexColumnIssues: Array<{ version: string; filename: string; indexName: string; targetTable: string; missingColumns: string[] }> = [];
    const pendingIndexColumnUnverified: Array<{ version: string; filename: string; indexName: string; targetTable: string; reason: string }> = [];
    const pendingAlterTargetIssues: Array<{ version: string; filename: string; targetTable: string; operation: string; objectName: string; actualParentKind: string | null }> = [];
    const pendingRelationRenameIssues: Array<{ version: string; filename: string; sourceTable: string; targetTable: string; problem: "source_not_found" | "target_already_exists" }> = [];
    const pendingRelationSchemaUnverified: Array<{ version: string; filename: string; relationName: string; relationSchema: string; operation: string; reason: string }> = [];
    const pendingRelationCascadeUnverified: Array<{ version: string; filename: string; relationName: string; relationSchema: string; reason: string }> = [];
    const pendingRelationReferencedByForeignKeyIssues: Array<{ version: string; filename: string; relationName: string; referencingTable: string; constraintName: string | null }> = [];
    const pendingColumnReferencedByForeignKeyIssues: Array<{ version: string; filename: string; tableName: string; columnName: string; referencingTable: string; constraintName: string | null }> = [];
    const pendingSchemaDropUnverified = findFlywaySchemaDropEffects(migrationSql)
      .filter(({ version }) => pendingVersions.has(version))
      .map(({ schemaNames, cascade, ...migration }) => ({ ...migration, schemaNames, cascade, reason: "DROP SCHEMA can remove contained objects and CASCADE can remove dependent objects beyond the modeled relation inventory" }));
    const pendingPublicSchemaRenameUnverified = findFlywaySchemaRenameEffects(migrationSql)
      .filter(({ version, sourceSchema, targetSchema }) => pendingVersions.has(version) && (sourceSchema === "public" || targetSchema === "public"))
      .map((effect) => ({ ...effect, reason: "ALTER SCHEMA rename changes the namespace boundary represented by the public-only relation catalog" }));
    const pendingTypeCascadeDropUnverified = findFlywayTypeCascadeDropEffects(migrationSql)
      .filter(({ version }) => pendingVersions.has(version))
      .map((effect) => ({ ...effect, reason: "DROP TYPE CASCADE can remove dependent table columns and other objects outside the modeled type inventory" }));
    const pendingDomainCascadeDropUnverified = findFlywayDomainCascadeDropEffects(migrationSql)
      .filter(({ version }) => pendingVersions.has(version))
      .map((effect) => ({ ...effect, reason: "DROP DOMAIN CASCADE can remove dependent table columns and other objects outside the modeled domain inventory" }));
    const pendingDropOwnedUnverified = findFlywayDropOwnedEffects(migrationSql)
      .filter(({ version }) => pendingVersions.has(version))
      .map((effect) => ({ ...effect, reason: "DROP OWNED removes role-owned database objects and privileges that are outside the modeled relation inventory" }));
    const pendingAlterObjectSchemaUnverified: Array<{ version: string; filename: string; tableName: string; tableSchema: string; objectKind: "column" | "constraint"; objectName: string; operation: string; reason: string }> = [];
    const pendingAlterDropDependenciesUnverified: Array<{ version: string; filename: string; tableName: string; objectKind: "column" | "constraint"; objectName: string; cascade: boolean; reason: string }> = [];
    const pendingAlterUniqueKeyUnverified: Array<{ version: string; filename: string; tableName: string; constraintName: string; reason: string }> = [];
    const pendingUnmodeledAlterUniqueKeys = findFlywayUnmodeledAlterUniqueKeyEffects(migrationSql)
      .filter(({ version }) => pendingVersions.has(version))
      .map((effect) => ({ ...effect, reason: "anonymous or USING INDEX unique/primary-key constraint forms are outside the source-order unique-key model" }));
    const pendingAlterEffects: Array<{ version: string; filename: string; targetTable: string; objectKind: "column" | "constraint"; operation: "present" | "absent" | "verify"; objectName: string; ifExists: boolean; ifNotExists: boolean; tableIfExists: boolean }> = [];
    const pendingAlterObjectStateIssues: Array<{ version: string; filename: string; targetTable: string; objectKind: "column" | "constraint"; operation: string; objectName: string; problem: "already_exists" | "not_found" }> = [];
    const pendingAlterObjectStateUnverified: Array<{ version: string; filename: string; targetTable: string; objectKind: "column" | "constraint"; operation: string; objectName: string; reason: string }> = [];
    const pendingCreateTableRelationKindIssues: Array<{ version: string; filename: string; tableName: string; actualKind: string }> = [];
    const pendingCreateTableDefinitionUnverified: Array<{ version: string; filename: string; tableName: string; feature: "LIKE" | "AS_QUERY" | "TYPED_TABLE" | "PARTITION_OF" | "PARTITIONED_TABLE" | "INHERITS" | "SELECT_INTO"; sourceTable: string | null; options: string[]; reason: string }> = [];
    const pendingCreateTableColumnIssues: Array<{ version: string; filename: string; tableName: string; missingColumns: string[] }> = [];
    const pendingCreateTableColumnUnverified: Array<{ version: string; filename: string; tableName: string; reason: string }> = [];
    const pendingCreateTableForeignKeyIssues: Array<{ version: string; filename: string; tableName: string; localColumns: string[]; targetTable: string; targetColumns: string[] | null; problem: "missing_constraint" | "not_validated" | "match_type_mismatch" | "on_delete_mismatch" | "on_delete_columns_mismatch" | "on_update_mismatch" | "deferrability_mismatch" | "initially_deferred_mismatch" }> = [];
    const pendingCreateTableConstraintIssues: Array<{ version: string; filename: string; tableName: string; constraintType: "p" | "u" | "c"; columns: string[]; constraintName: string | null; problem: "missing_constraint" | "definition_mismatch" | "not_validated" }> = [];
    const pendingCreateTableConstraintUnverified: Array<{ version: string; filename: string; tableName: string; constraintName: string | null; reason: string }> = [];
    const pendingForeignKeyTargetIssues: Array<{ version: string; filename: string; sourceTable: string; targetTable: string; targetKind: string | null; missingColumns: string[]; problem: "local_column_missing" | "target_relation_missing" | "target_column_missing" | "target_columns_not_unique" | "target_primary_key_missing" }> = [];
    const pendingForeignKeyTargetUnverified: Array<{ version: string; filename: string; sourceTable: string; targetTable: string; reason: string }> = [];
    const pendingForeignKeyTargets: Array<{ version: string; filename: string; sourceTable: string; localColumns: string[]; targetSchema: string | null; targetTable: string; targetColumns: string[] | null }> = [];
    const pendingIndexNameConflicts: Array<{ version: string; filename: string; indexName: string; targetTable: string; existingKind: string; existingParentTable: string | null }> = [];
    const pendingIndexConstraintDropIssues: Array<{ version: string; filename: string; indexName: string; tableName: string; constraintName: string }> = [];
    const pendingIndexReferencedByForeignKeyIssues: Array<{ version: string; filename: string; indexName: string; tableName: string; constraintName: string | null }> = [];
    const pendingUniqueConstraintDropDependencyIssues: Array<{ version: string; filename: string; tableName: string; constraintName: string; backingIndexName: string | null; referencingTable: string; referencingConstraint: string | null }> = [];
    const pendingIndexCascadeUnverified: Array<{ version: string; filename: string; indexName: string; reason: string }> = [];
    const pendingConcurrentIndexDropMultiTargetIssues: Array<{ version: string; filename: string; indexNames: string[] }> = [];
    const pendingConcurrentIndexDropCascadeIssues: Array<{ version: string; filename: string; indexNames: string[] }> = [];
    const pendingConcurrentIndexDropPartitionedTableIssues: Array<{ version: string; filename: string; indexName: string; tableName: string }> = [];
    const pendingIndexNameUnverified: Array<{ version: string; filename: string; targetTable: string }> = [];
    const pendingPartitionedIndexOnlyUnverified: Array<{ version: string; filename: string; indexName: string; targetTable: string }> = [];
    const pendingIndexDefinitionUnverified: Array<{ version: string; filename: string; indexName: string; targetTable: string; reason: string; sourceKeyTerms: unknown; sourceIncludeColumns: string[] | null; sourcePredicateExpression: string | null; sourceUnverifiedOptions: string[]; sourceNullsNotDistinct: boolean; catalogDefinition: string; catalogIncludeColumns: string[]; catalogPredicateExpression: string | null; catalogUnique: boolean; catalogNullsNotDistinct: boolean; catalogMethod: string; catalogHasPredicate: boolean; catalogIsValid: boolean; catalogIsReady: boolean; catalogIsLive: boolean }> = [];
    const availableRelationKinds = new Map(catalogRelationKinds);
    const availableIndexParentByName = new Map(catalogIndexParentByName);
    const skippedRelationRenames = new Set<string>();
    for (const migration of migrationSql) {
      if (!pendingVersions.has(migration.version)) continue;
      const sourceTableDefinitions = parseFlywayCreateTableColumns(migration);
      const sourceSpecialDefinitions = parseFlywayCreateTableSpecialDefinitions(migration);
      for (const definition of sourceSpecialDefinitions) {
        pendingCreateTableDefinitionUnverified.push({ version: migration.version, filename: migration.filename, ...definition, reason: "CREATE TABLE derived or inherited shape/options are not catalog-compared" });
      }
      const sourceLikeByTable = new Map(sourceTableDefinitions.filter(({ likeSource }) => likeSource).map(({ tableName, likeSource }) => [tableName, likeSource!]));
      const sourcePartitionedTables = new Set(sourceSpecialDefinitions.filter(({ feature }) => feature === "PARTITIONED_TABLE").map(({ tableName }) => tableName));
      const sourceColumnsByTable = new Map(sourceTableDefinitions.map(({ tableName, columns }) => [tableName, new Set(columns)]));
      const sourceConstraintNamesByTable = new Map(sourceTableDefinitions.map(({ tableName, namedConstraints }) => [tableName, namedConstraints]));
      const sourceUniqueKeysByTable = new Map(sourceTableDefinitions.map(({ tableName, uniqueKeys }) => [tableName, uniqueKeys]));
      const sourceReferencesByTable = new Map(sourceTableDefinitions.map(({ tableName, references }) => [tableName, references]));
      const sourceConstraintsByTable = new Map(sourceTableDefinitions.map(({ tableName, uniqueKeys, checks, unsupportedConstraints }) => [tableName, { uniqueKeys, checks, unsupportedConstraints }]));
      const migrationEffects = parseFlywayDdlEffects(migration);
      const inspectedIndexDropStatements = new Set<number>();
      const blockedIndexDropStatements = new Set<number>();
      const inspectedUniqueConstraintDropStatements = new Set<number>();
      const blockedUniqueConstraintDropStatements = new Set<number>();
      const blockedRelationDropStatements = new Set<number>();
      const inspectedRelationDropStatements = new Set<number>();
      const blockedColumnDropStatements = new Set<number>();
      const inspectedColumnDropStatements = new Set<number>();
      const relationDropEffectsByStatement = new Map<number, typeof migrationEffects>();
      for (const candidate of migrationEffects) {
        if (candidate.kind !== "relation" || candidate.operation !== "absent" || candidate.relationType !== "any" || candidate.dropCascade || candidate.statementStart === undefined) continue;
        const statementDrops = relationDropEffectsByStatement.get(candidate.statementStart) ?? [];
        statementDrops.push(candidate);
        relationDropEffectsByStatement.set(candidate.statementStart, statementDrops);
      }
      for (const effect of migrationEffects) {
        if (effect.kind === "column" && effect.dropColumn && effect.operation === "absent" && effect.tableName
          && !effect.dropCascade && effect.statementStart !== undefined
          && (!effect.tableSchemaName || effect.tableSchemaName === "public")
          && !inspectedColumnDropStatements.has(effect.statementStart)) {
          inspectedColumnDropStatements.add(effect.statementStart);
          const statementDrops = migrationEffects.filter((candidate) => candidate.kind === "column" && candidate.dropColumn
            && candidate.operation === "absent" && candidate.tableName && candidate.statementStart === effect.statementStart);
          const issues = findFlywayColumnDropForeignKeyDependencyIssues(
            statementDrops.map((drop) => ({ name: drop.name, tableName: drop.tableName!, statementStart: drop.statementStart!, dropCascade: drop.dropCascade, tableSchemaName: drop.tableSchemaName })),
            availableForeignKeyIndexDependents,
          );
          for (const issue of issues) {
            pendingColumnReferencedByForeignKeyIssues.push({ version: migration.version, filename: migration.filename, ...issue });
            blockedColumnDropStatements.add(issue.statementStart);
          }
        }
        if (effect.statementStart !== undefined && blockedColumnDropStatements.has(effect.statementStart)) continue;
        if (effect.kind === "relation" && effect.operation === "absent" && effect.statementStart !== undefined
          && !inspectedRelationDropStatements.has(effect.statementStart)) {
          inspectedRelationDropStatements.add(effect.statementStart);
          const relationDrops = (relationDropEffectsByStatement.get(effect.statementStart) ?? [])
            .filter((drop) => availablePhysicalRelations.has(drop.name));
          for (const issue of findFlywayRelationDropForeignKeyDependencyIssues(
            relationDrops.map((drop) => ({ name: drop.name, statementStart: effect.statementStart!, schemaName: drop.schemaName })),
            availableForeignKeyIndexDependents,
          )) {
            pendingRelationReferencedByForeignKeyIssues.push({ version: migration.version, filename: migration.filename, ...issue });
            blockedRelationDropStatements.add(issue.statementStart);
          }
        }
        if (effect.kind === "relation" && effect.operation === "absent" && effect.statementStart !== undefined && blockedRelationDropStatements.has(effect.statementStart)) continue;
        if (effect.statementStart !== undefined && !inspectedUniqueConstraintDropStatements.has(effect.statementStart)) {
          const statementStart = effect.statementStart;
          const statementDrops = migrationEffects.filter((candidate) => candidate.statementStart === statementStart
            && candidate.kind === "constraint" && candidate.operation === "absent" && !candidate.renamedToConstraint
            && !candidate.requiresExistingConstraint && candidate.tableName);
          inspectedUniqueConstraintDropStatements.add(statementStart);
          const issues = findFlywayUniqueConstraintDropForeignKeyDependencyIssues(
            statementDrops.map((drop) => ({
              name: drop.name,
              tableName: drop.tableName!,
              statementStart,
              dropCascade: drop.dropCascade,
              renamedToConstraint: drop.renamedToConstraint,
              requiresExistingConstraint: drop.requiresExistingConstraint,
            })),
            availableUniqueKeysByTable,
            availableForeignKeyIndexDependents,
          );
          for (const issue of issues) pendingUniqueConstraintDropDependencyIssues.push({ version: migration.version, filename: migration.filename, ...issue });
          if (issues.length > 0) blockedUniqueConstraintDropStatements.add(statementStart);
        }
        if (effect.statementStart !== undefined && blockedUniqueConstraintDropStatements.has(effect.statementStart)) continue;
        if (effect.kind === "index" && effect.operation === "absent" && effect.statementStart !== undefined && !inspectedIndexDropStatements.has(effect.statementStart)) {
          const statementStart = effect.statementStart;
          const dropEffects = migrationEffects.filter((candidate) => candidate.kind === "index" && candidate.operation === "absent" && candidate.statementStart === statementStart);
          inspectedIndexDropStatements.add(statementStart);
          let statementBlocked = false;
          if (dropEffects.some((candidate) => candidate.indexConcurrently) && dropEffects.length > 1) {
            pendingConcurrentIndexDropMultiTargetIssues.push({
              version: migration.version,
              filename: migration.filename,
              indexNames: dropEffects.map(({ name }) => name),
            });
            statementBlocked = true;
          }
          if (dropEffects.some((candidate) => candidate.indexConcurrentDropCascadeUnsupported)) {
            pendingConcurrentIndexDropCascadeIssues.push({
              version: migration.version,
              filename: migration.filename,
              indexNames: dropEffects.map(({ name }) => name),
            });
            statementBlocked = true;
          }
          for (const dropEffect of dropEffects) {
            const indexParentTable = availableIndexParentByName.get(dropEffect.name);
            if (dropEffect.indexConcurrently && indexParentTable && availableRelationKinds.get(indexParentTable) === "p") {
              pendingConcurrentIndexDropPartitionedTableIssues.push({
                version: migration.version,
                filename: migration.filename,
                indexName: dropEffect.name,
                tableName: indexParentTable,
              });
              statementBlocked = true;
            }
            if (dropEffect.schemaName && dropEffect.schemaName !== "public") {
              pendingIndexSchemaUnverified.push({
                version: migration.version,
                filename: migration.filename,
                indexName: dropEffect.name,
                targetSchema: dropEffect.schemaName,
                reason: "DROP INDEX target schema is outside the public-only catalog audit",
              });
              statementBlocked = true;
            }
            if (dropEffect.dropCascade) {
              pendingIndexCascadeUnverified.push({
                version: migration.version,
                filename: migration.filename,
                indexName: dropEffect.name,
                reason: "DROP INDEX CASCADE can remove dependent constraints and other catalog objects beyond the modeled source inventory",
              });
            }
            const owningConstraintEntry = [...availableUniqueKeysByTable.entries()]
              .map(([tableName, keys]) => ({ tableName, constraint: findFlywayOwningUniqueConstraint(keys, dropEffect.name) }))
              .find(({ constraint }) => constraint !== null);
            const owningExclusionConstraint = findFlywayIndexConstraintOwner(availableExclusionIndexOwners, dropEffect.name);
            const owningConstraintName = owningConstraintEntry?.constraint?.constraintName ?? owningExclusionConstraint?.constraintName;
            const owningConstraintTable = owningConstraintEntry?.tableName ?? owningExclusionConstraint?.tableName;
            if (owningConstraintName && owningConstraintTable && (dropEffect.indexConcurrently || !dropEffect.dropCascade)) {
              pendingIndexConstraintDropIssues.push({
                version: migration.version,
                filename: migration.filename,
                indexName: dropEffect.name,
                tableName: owningConstraintTable,
                constraintName: owningConstraintName,
              });
              statementBlocked = true;
            }
            const foreignKeyDependents = findFlywayIndexForeignKeyDependents(availableForeignKeyIndexDependents, dropEffect.name);
            const unresolvedForeignKeyDependents = indexParentTable
              ? availableForeignKeyIndexDependents.filter((dependent) => dependent.indexName === null && dependent.referencedTable === indexParentTable)
              : [];
            for (const dependent of unresolvedForeignKeyDependents) {
              if (!foreignKeyDependents.includes(dependent)) foreignKeyDependents.push(dependent);
            }
            if (foreignKeyDependents.length > 0 && (dropEffect.indexConcurrently || !dropEffect.dropCascade)) {
              for (const dependent of foreignKeyDependents) {
                pendingIndexReferencedByForeignKeyIssues.push({
                  version: migration.version,
                  filename: migration.filename,
                  indexName: dropEffect.name,
                  tableName: dependent.tableName,
                  constraintName: dependent.constraintName,
                });
              }
              statementBlocked = true;
            }
          }
          if (statementBlocked) blockedIndexDropStatements.add(statementStart);
        }
        if (effect.kind === "column" && effect.dropColumn) {
          pendingAlterDropDependenciesUnverified.push({
            version: migration.version,
            filename: migration.filename,
            tableName: effect.tableName ?? "",
            objectKind: "column",
            objectName: effect.name,
            cascade: effect.dropCascade ?? false,
            reason: "DROP COLUMN automatically removes local indexes and constraints, and CASCADE can remove external dependent objects; those effects are not simulated",
          });
        }
        if (effect.kind === "relation") {
          if (effect.operation === "absent" && effect.dropCascade) {
            pendingRelationCascadeUnverified.push({
              version: migration.version,
              filename: migration.filename,
              relationName: effect.name,
              relationSchema: effect.schemaName ?? "public/search_path",
              reason: "CASCADE may remove dependent relations outside the explicit drop list",
            });
          }
          if (effect.schemaName && effect.schemaName !== "public") {
            pendingRelationSchemaUnverified.push({
              version: migration.version,
              filename: migration.filename,
              relationName: effect.name,
              relationSchema: effect.schemaName,
              operation: effect.operation,
              reason: "relation schema is outside the public-only catalog audit",
            });
            continue;
          }
          const relationRenameKey = `${migration.version}:${migration.filename}:${effect.renamedFromRelation ?? effect.name}`;
          if (effect.renamedFromRelation && skippedRelationRenames.has(relationRenameKey)) continue;
          if (effect.renamedToRelation) {
            const sourceTable = effect.name;
            const targetTable = effect.renamedToRelation;
            if (!availablePhysicalRelations.has(sourceTable)) {
              if (!effect.ifExists) {
                pendingRelationRenameIssues.push({ version: migration.version, filename: migration.filename, sourceTable, targetTable, problem: "source_not_found" });
              }
              skippedRelationRenames.add(`${migration.version}:${migration.filename}:${sourceTable}`);
              continue;
            }
            if (availableRelationKinds.has(targetTable)) {
              pendingRelationRenameIssues.push({ version: migration.version, filename: migration.filename, sourceTable, targetTable, problem: "target_already_exists" });
              skippedRelationRenames.add(`${migration.version}:${migration.filename}:${sourceTable}`);
              continue;
            }
            availablePhysicalRelations.delete(sourceTable);
            availablePhysicalRelations.add(targetTable);
            availableIndexableRelations.delete(sourceTable);
            availableIndexableRelations.add(targetTable);
            const relationKind = availableRelationKinds.get(sourceTable);
            availableRelationKinds.delete(sourceTable);
            if (relationKind) availableRelationKinds.set(targetTable, relationKind);
            const columns = availableColumnsByTable.get(sourceTable);
            availableColumnsByTable.delete(sourceTable);
            if (columns) availableColumnsByTable.set(targetTable, columns);
            const uniqueKeys = availableUniqueKeysByTable.get(sourceTable);
            availableUniqueKeysByTable.delete(sourceTable);
            if (uniqueKeys) availableUniqueKeysByTable.set(targetTable, uniqueKeys);
            for (const owner of availableExclusionIndexOwners) {
              if (owner.tableName === sourceTable) owner.tableName = targetTable;
            }
            for (const dependent of availableForeignKeyIndexDependents) {
              if (dependent.tableName === sourceTable) dependent.tableName = targetTable;
              if (dependent.referencedTable === sourceTable) dependent.referencedTable = targetTable;
            }
            for (const constraint of [...availableConstraintNames]) {
              if (!constraint.startsWith(sourceTable + ".")) continue;
              availableConstraintNames.delete(constraint);
              availableConstraintNames.add(targetTable + constraint.slice(sourceTable.length));
            }
            for (const [indexName, parentTable] of availableIndexParentByName) {
              if (parentTable === sourceTable) availableIndexParentByName.set(indexName, targetTable);
            }
            continue;
          }
          if (effect.operation === "present" && effect.relationType === "materialized_view") {
            availableIndexableRelations.add(effect.name);
            availableRelationKinds.set(effect.name, "m");
            continue;
          }
          if (effect.operation === "present" && effect.relationType === "table") {
            const likeSource = sourceLikeByTable.get(effect.name);
            if (likeSource) {
              pendingCreateTableDefinitionUnverified.push({
                version: migration.version,
                filename: migration.filename,
                tableName: effect.name,
                feature: "LIKE",
                sourceTable: likeSource.tableName,
                options: likeSource.options,
                reason: "LIKE-derived columns, defaults, generated/identity properties, storage, and copied constraints are not catalog-compared",
              });
            }
          }
          if (effect.operation === "absent" || effect.relationType === "view") {
            availablePhysicalRelations.delete(effect.name);
            availableIndexableRelations.delete(effect.name);
            availableColumnsByTable.delete(effect.name);
            availableRelationKinds.delete(effect.name);
            availableIndexParentByName.delete(effect.name);
            availableUniqueKeysByTable.delete(effect.name);
            for (const [indexName, parentTable] of [...availableIndexParentByName]) {
              if (parentTable !== effect.name) continue;
              availableIndexParentByName.delete(indexName);
              availableCatalogIndexByName.delete(indexName);
              availableRelationKinds.delete(indexName);
              for (let dependentIndex = availableForeignKeyIndexDependents.length - 1; dependentIndex >= 0; dependentIndex -= 1) {
                if (availableForeignKeyIndexDependents[dependentIndex].indexName !== indexName) continue;
                const dependent = availableForeignKeyIndexDependents[dependentIndex];
                availableConstraintNames.delete(`${dependent.tableName}.${dependent.constraintName}`);
                availableForeignKeyIndexDependents.splice(dependentIndex, 1);
              }
            }
            for (let ownerIndex = availableExclusionIndexOwners.length - 1; ownerIndex >= 0; ownerIndex -= 1) {
              if (availableExclusionIndexOwners[ownerIndex].tableName === effect.name) availableExclusionIndexOwners.splice(ownerIndex, 1);
            }
            for (let dependentIndex = availableForeignKeyIndexDependents.length - 1; dependentIndex >= 0; dependentIndex -= 1) {
              if (availableForeignKeyIndexDependents[dependentIndex].tableName === effect.name) availableForeignKeyIndexDependents.splice(dependentIndex, 1);
            }
            for (const constraint of availableConstraintNames) {
              if (constraint.startsWith(effect.name + ".")) availableConstraintNames.delete(constraint);
            }
          } else {
            const existingKind = availableRelationKinds.get(effect.name);
            if (existingKind && existingKind !== "r" && existingKind !== "p") {
              pendingCreateTableRelationKindIssues.push({
                version: migration.version,
                filename: migration.filename,
                tableName: effect.name,
                actualKind: existingKind,
              });
              availablePhysicalRelations.delete(effect.name);
              availableIndexableRelations.delete(effect.name);
              continue;
            }
            const declaredColumns = sourceColumnsByTable.get(effect.name);
            const declaredUniqueKeys = sourceUniqueKeysByTable.get(effect.name);
            const existingColumns = availableColumnsByTable.get(effect.name);
            if (!existingKind) {
              for (const reference of sourceReferencesByTable.get(effect.name) ?? []) {
                const targetTable = reference.targetTable;
                pendingForeignKeyTargets.push({
                  version: migration.version,
                  filename: migration.filename,
                  sourceTable: effect.name,
                  localColumns: reference.localColumns,
                  targetSchema: reference.targetSchema,
                  targetTable: reference.targetTable,
                  targetColumns: reference.targetColumns,
                });
                if (reference.targetSchema && reference.targetSchema !== "public") {
                  pendingForeignKeyTargetUnverified.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    reason: `CREATE TABLE foreign key references schema ${reference.targetSchema}, outside the public-only catalog audit`,
                  });
                  continue;
                }
                const missingLocalColumns = reference.localColumns.filter((column) => !declaredColumns?.has(column));
                if (missingLocalColumns.length > 0) {
                  pendingForeignKeyTargetIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    targetKind: catalogRelationKinds.get(targetTable) ?? "pending_table",
                    missingColumns: missingLocalColumns,
                    problem: "local_column_missing",
                  });
                  continue;
                }
                const targetExists = targetTable === effect.name
                  || availablePhysicalRelations.has(targetTable);
                if (!targetExists) {
                  pendingForeignKeyTargetIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    targetKind: catalogRelationKinds.get(targetTable) ?? null,
                    missingColumns: reference.targetColumns ?? [],
                    problem: "target_relation_missing",
                  });
                  continue;
                }
                const targetColumns = targetTable === effect.name
                  ? declaredColumns
                  : availableColumnsByTable.get(targetTable);
                if (!targetColumns) {
                  pendingForeignKeyTargetUnverified.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    reason: "referenced target columns are unavailable from catalog or earlier pending CREATE TABLE source",
                  });
                  continue;
                }
                const sourceTargetKeys = targetTable === effect.name
                  ? declaredUniqueKeys
                  : availableUniqueKeysByTable.get(targetTable);
                const resolvedTargetColumns = reference.targetColumns
                  ?? sourceTargetKeys?.find((key) => key.primary && !key.deferrable)?.columns
                  ?? null;
                if (resolvedTargetColumns === null) {
                  if (sourceTargetKeys) {
                    pendingForeignKeyTargetIssues.push({
                      version: migration.version,
                      filename: migration.filename,
                      sourceTable: effect.name,
                      targetTable: reference.targetTable,
                      targetKind: catalogRelationKinds.get(targetTable) ?? "pending_table",
                      missingColumns: [],
                      problem: "target_primary_key_missing",
                    });
                  } else {
                    pendingForeignKeyTargetUnverified.push({
                      version: migration.version,
                      filename: migration.filename,
                      sourceTable: effect.name,
                      targetTable: reference.targetTable,
                      reason: "REFERENCES omits target columns and the referenced primary key could not be resolved",
                    });
                  }
                  continue;
                }
                const missingColumns = resolvedTargetColumns.filter((column) => !targetColumns.has(column));
                if (missingColumns.length > 0) {
                  pendingForeignKeyTargetIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    targetKind: catalogRelationKinds.get(targetTable) ?? "pending_table",
                    missingColumns,
                    problem: "target_column_missing",
                  });
                  continue;
                }
                const isUniqueTarget = sourceTargetKeys?.some((key) =>
                  !key.deferrable
                  && matchesFlywayForeignKeyTargetKey(resolvedTargetColumns, key.columns),
                ) ?? false;
                if (!isUniqueTarget) {
                  pendingForeignKeyTargetIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    targetKind: catalogRelationKinds.get(targetTable) ?? "pending_table",
                    missingColumns: [],
                    problem: "target_columns_not_unique",
                  });
                } else if (!existingKind && sourceTargetKeys) {
                  const matchingKeys = sourceTargetKeys.filter((key) => !key.deferrable && matchesFlywayForeignKeyTargetKey(resolvedTargetColumns, key.columns));
                  for (const key of matchingKeys) {
                    const backingIndexName = key.constraintName ?? null;
                    if (!availableForeignKeyIndexDependents.some((dependent) =>
                      dependent.tableName === effect.name
                      && dependent.constraintName === (reference.constraintName ?? null)
                      && dependent.referencedTable === targetTable
                      && dependent.indexName === backingIndexName,
                    )) {
                      availableForeignKeyIndexDependents.push({
                        indexName: backingIndexName,
                        tableName: effect.name,
                        constraintName: reference.constraintName ?? null,
                        referencedTable: targetTable,
                        localColumns: reference.localColumns,
                        referencedColumns: resolvedTargetColumns,
                      });
                    }
                  }
                }
              }
            }
            if ((existingKind === "r" || existingKind === "p") && declaredColumns && existingColumns) {
              const missingColumns = [...declaredColumns].filter((column) => !existingColumns.has(column));
              if (missingColumns.length > 0) {
                pendingCreateTableColumnIssues.push({
                  version: migration.version,
                  filename: migration.filename,
                  tableName: effect.name,
                  missingColumns,
                });
              }
            } else if ((existingKind === "r" || existingKind === "p") && declaredColumns && !existingColumns) {
              pendingCreateTableColumnUnverified.push({
                version: migration.version,
                filename: migration.filename,
                tableName: effect.name,
                reason: "catalog columns are unavailable for comparing the existing table with CREATE TABLE source",
              });
            }
            if ((existingKind === "r" || existingKind === "p") && (sourceReferencesByTable.get(effect.name)?.length ?? 0) > 0) {
              for (const reference of sourceReferencesByTable.get(effect.name) ?? []) {
                if (reference.targetSchema && reference.targetSchema !== "public") {
                  pendingForeignKeyTargetUnverified.push({
                    version: migration.version,
                    filename: migration.filename,
                    sourceTable: effect.name,
                    targetTable: reference.targetTable,
                    reason: `CREATE TABLE foreign key references schema ${reference.targetSchema}, outside the public-only catalog audit`,
                  });
                  continue;
                }
                const targetTable = reference.targetTable;
                const targetColumns = reference.targetColumns
                  ?? availableUniqueKeysByTable.get(targetTable)?.find((key) => key.primary && !key.deferrable)?.columns
                  ?? null;
                const matchingForeignKey = targetColumns === null
                  ? null
                  : catalogForeignKeysByTable.get(effect.name)?.find((foreignKey) =>
                    foreignKey.referenced_table === targetTable
                    && foreignKey.key_columns.join(",") === reference.localColumns.join(",")
                    && foreignKey.referenced_columns.join(",") === targetColumns.join(","),
                  );
                if (!matchingForeignKey) {
                  pendingCreateTableForeignKeyIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    tableName: effect.name,
                    localColumns: reference.localColumns,
                    targetTable: reference.targetTable,
                    targetColumns,
                    problem: "missing_constraint",
                  });
                } else if (!matchingForeignKey.is_validated) {
                  pendingCreateTableForeignKeyIssues.push({
                    version: migration.version,
                    filename: migration.filename,
                    tableName: effect.name,
                    localColumns: reference.localColumns,
                    targetTable: reference.targetTable,
                    targetColumns,
                    problem: "not_validated",
                  });
                }
                if (matchingForeignKey) {
                  const expectedMatchType = reference.matchType === "FULL" ? "f" : reference.matchType === "PARTIAL" ? "p" : "s";
                  const expectedAction = (action: string) => ({ "NO ACTION": "a", RESTRICT: "r", CASCADE: "c", "SET NULL": "n", "SET DEFAULT": "d" })[action];
                  const mismatches = [
                    ...(matchingForeignKey.match_type !== expectedMatchType ? ["match_type_mismatch" as const] : []),
                    ...(matchingForeignKey.on_delete !== expectedAction(reference.onDelete) ? ["on_delete_mismatch" as const] : []),
                    ...(JSON.stringify(matchingForeignKey.on_delete_columns ?? []) !== JSON.stringify(reference.onDeleteColumns ?? []) ? ["on_delete_columns_mismatch" as const] : []),
                    ...(matchingForeignKey.on_update !== expectedAction(reference.onUpdate) ? ["on_update_mismatch" as const] : []),
                    ...(matchingForeignKey.is_deferrable !== reference.deferrable ? ["deferrability_mismatch" as const] : []),
                    ...(matchingForeignKey.initially_deferred !== reference.initiallyDeferred ? ["initially_deferred_mismatch" as const] : []),
                  ];
                  for (const problem of mismatches) {
                    pendingCreateTableForeignKeyIssues.push({
                      version: migration.version,
                      filename: migration.filename,
                      tableName: effect.name,
                      localColumns: reference.localColumns,
                      targetTable: reference.targetTable,
                      targetColumns,
                      problem,
                    });
                  }
                }
              }
            }
            const declaredConstraints = sourceConstraintsByTable.get(effect.name);
            for (const constraint of declaredConstraints?.unsupportedConstraints ?? []) {
              pendingCreateTableConstraintUnverified.push({
                version: migration.version,
                filename: migration.filename,
                tableName: effect.name,
                constraintName: constraint.name,
                reason: `source ${constraint.kind.toUpperCase()} constraint comparison is not implemented`,
              });
              if (!existingKind && constraint.kind === "exclude" && constraint.name) {
                availableExclusionIndexOwners.push({ indexName: constraint.name, tableName: effect.name, constraintName: constraint.name });
              }
            }
            if (existingKind === "r" || existingKind === "p") {
              const catalogTableConstraints = catalogConstraints.rows.filter((constraint) => constraint.table_name === effect.name);
              for (const key of declaredConstraints?.uniqueKeys ?? []) {
                const constraintType = key.primary ? "p" : "u";
                const matching = catalogTableConstraints.find((constraint) =>
                  constraint.constraint_type === constraintType
                  && JSON.stringify(constraint.key_columns) === JSON.stringify(key.columns),
                );
                if (!matching) {
                  pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType, columns: key.columns, constraintName: null, problem: "missing_constraint" });
                } else if (!matching.is_validated || matching.is_deferrable !== key.deferrable || matching.initially_deferred !== key.initiallyDeferred
                  || matching.nulls_not_distinct !== key.nullsNotDistinct
                  || JSON.stringify(matching.included_columns) !== JSON.stringify(key.includeColumns)) {
                  pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType, columns: key.columns, constraintName: matching.name, problem: !matching.is_validated ? "not_validated" : "definition_mismatch" });
                }
              }
              for (const check of declaredConstraints?.checks ?? []) {
                const candidates = catalogTableConstraints.filter((constraint) => constraint.constraint_type === "c"
                  && (!check.name || constraint.name === check.name));
                const checkComparisons = candidates.map((constraint) => {
                  const catalogExpression = extractFlywayCheckExpression(constraint.constraint_definition);
                  return catalogExpression === null
                    ? { constraint, result: "unverified" as const }
                    : { constraint, result: compareFlywayCheckExpressions(check.expression, catalogExpression) };
                });
                const matching = checkComparisons.find(({ result }) => result === "match")?.constraint;
                if (!matching) {
                  if (check.name && candidates.length === 0) {
                    pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: check.name, problem: "missing_constraint" });
                  } else if (checkComparisons.some(({ result }) => result === "unverified")) {
                    pendingCreateTableConstraintUnverified.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintName: check.name, reason: "could not parse pg_get_constraintdef CHECK expression" });
                  } else if (check.name) {
                    pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: check.name, problem: "definition_mismatch" });
                  } else if (candidates.length === 0) {
                    pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: null, problem: "missing_constraint" });
                  } else {
                    pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: null, problem: "definition_mismatch" });
                  }
                } else if (!matching.is_validated) {
                  pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: matching.name, problem: "not_validated" });
                } else if (matching.no_inherit !== check.noInherit) {
                  pendingCreateTableConstraintIssues.push({ version: migration.version, filename: migration.filename, tableName: effect.name, constraintType: "c", columns: [], constraintName: matching.name, problem: "definition_mismatch" });
                }
              }
            }
            availablePhysicalRelations.add(effect.name);
            availableIndexableRelations.add(effect.name);
            availableRelationKinds.set(effect.name, existingKind ?? (sourcePartitionedTables.has(effect.name) ? "p" : "r"));
            if (!existingKind && declaredColumns) {
              availableColumnsByTable.set(effect.name, new Set(declaredColumns));
              availableUniqueKeysByTable.set(effect.name, (declaredUniqueKeys ?? []).map((key) => ({
                ...key,
                ...(key.constraintName ? { backingIndexName: key.constraintName, indexName: key.constraintName } : {}),
              })));
              for (const constraintName of sourceConstraintNamesByTable.get(effect.name) ?? []) {
                availableConstraintNames.add(`${effect.name}.${constraintName}`);
              }
            }
          }
          continue;
        }
        if ((effect.kind === "column" || effect.kind === "constraint") && effect.tableSchemaName && effect.tableSchemaName !== "public") {
          pendingAlterObjectSchemaUnverified.push({
            version: migration.version,
            filename: migration.filename,
            tableName: effect.tableName ?? "",
            tableSchema: effect.tableSchemaName,
            objectKind: effect.kind,
            objectName: effect.name,
            operation: effect.operation,
            reason: "ALTER TABLE target schema is outside the public-only catalog audit",
          });
          continue;
        }
        if (effect.kind === "column" && effect.tableName) {
          const targetTable = effect.tableName;
          pendingAlterEffects.push({
            version: migration.version,
            filename: migration.filename,
            targetTable,
            objectKind: "column",
            operation: effect.requiresExistingColumn ? "verify" : effect.operation,
            objectName: effect.name,
            ifExists: effect.ifExists ?? false,
            ifNotExists: effect.ifNotExists ?? false,
            tableIfExists: effect.tableIfExists ?? false,
          });
        if (!availableIndexableRelations.has(targetTable)) {
            if (!effect.tableIfExists) {
              pendingAlterTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                targetTable: effect.tableName,
                operation: effect.operation,
                objectName: effect.name,
                actualParentKind: catalogRelationKinds.get(targetTable) ?? null,
              });
            }
            continue;
          }
          const columns = availableColumnsByTable.get(targetTable);
          if (columns) {
            const alreadyExists = columns.has(effect.name);
            if (effect.requiresExistingColumn && !alreadyExists) {
              pendingAlterObjectStateIssues.push({
                version: migration.version,
                filename: migration.filename,
                targetTable,
                objectKind: "column",
                operation: "verify",
                objectName: effect.name,
                problem: "not_found",
              });
            } else if (!effect.requiresExistingColumn && effect.operation === "present" && alreadyExists && !effect.ifNotExists) {
              pendingAlterObjectStateIssues.push({
                version: migration.version,
                filename: migration.filename,
                targetTable,
                objectKind: "column",
                operation: effect.operation,
                objectName: effect.name,
                problem: "already_exists",
              });
            } else if (!effect.requiresExistingColumn && effect.operation === "absent" && !alreadyExists && !effect.ifExists) {
              pendingAlterObjectStateIssues.push({
                version: migration.version,
                filename: migration.filename,
                targetTable,
                objectKind: "column",
                operation: effect.operation,
                objectName: effect.name,
                problem: "not_found",
              });
            }
            if (!effect.requiresExistingColumn) {
              if (effect.operation === "present") columns.add(effect.name);
              else columns.delete(effect.name);
            }
            if (effect.dropColumn) {
              for (let dependentIndex = availableForeignKeyIndexDependents.length - 1; dependentIndex >= 0; dependentIndex -= 1) {
                const dependent = availableForeignKeyIndexDependents[dependentIndex];
                const affected = findFlywayColumnDropForeignKeyDependents([dependent], targetTable, effect.name).length > 0;
                if (!affected || (dependent.tableName !== targetTable && !effect.dropCascade)) continue;
                if (dependent.constraintName) availableConstraintNames.delete(`${dependent.tableName}.${dependent.constraintName}`);
                availableForeignKeyIndexDependents.splice(dependentIndex, 1);
              }
            }
          } else {
            pendingAlterObjectStateUnverified.push({
              version: migration.version,
              filename: migration.filename,
              targetTable,
              objectKind: "column",
              operation: effect.operation,
              objectName: effect.name,
              reason: "column catalog state is unavailable",
            });
          }
          continue;
        }
        if (effect.kind === "constraint" && effect.tableName) {
          const targetTable = effect.tableName;
          pendingAlterEffects.push({
            version: migration.version,
            filename: migration.filename,
            targetTable,
            objectKind: "constraint",
            operation: effect.requiresExistingConstraint ? "verify" : effect.operation,
            objectName: effect.name,
            ifExists: effect.ifExists ?? false,
            ifNotExists: effect.ifNotExists ?? false,
            tableIfExists: effect.tableIfExists ?? false,
          });
          if (!availablePhysicalRelations.has(targetTable)) {
            if (!effect.tableIfExists) {
              pendingAlterTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                targetTable: effect.tableName,
                operation: effect.operation,
                objectName: effect.name,
                actualParentKind: catalogRelationKinds.get(targetTable) ?? null,
              });
            }
            continue;
          }
          const constraintKey = targetTable + "." + effect.name;
          const alreadyExists = availableConstraintNames.has(constraintKey);
          if (effect.operation === "present" && effect.uniqueKeyUnverified) {
            pendingAlterUniqueKeyUnverified.push({
              version: migration.version,
              filename: migration.filename,
              tableName: targetTable,
              constraintName: effect.name,
              reason: "ALTER TABLE ADD UNIQUE/PRIMARY KEY uses key or INCLUDE syntax that the FK target-key source inventory cannot model",
            });
          }
          if (!effect.requiresExistingConstraint && effect.operation === "absent" && alreadyExists && effect.dropCascade) {
            pendingAlterDropDependenciesUnverified.push({
              version: migration.version,
              filename: migration.filename,
              tableName: targetTable,
              objectKind: "constraint",
              objectName: effect.name,
              cascade: effect.dropCascade ?? false,
              reason: "DROP CONSTRAINT CASCADE dependent-object effects are not simulated",
            });
          }
          if (!effect.requiresExistingConstraint && effect.operation === "absent" && alreadyExists) {
            const uniqueKeys = availableUniqueKeysByTable.get(targetTable) ?? [];
            const affectedConstraintKey = uniqueKeys.find((key) => key.constraintName === effect.name);
            if (effect.dropCascade && affectedConstraintKey?.backingIndexName) {
              for (let dependentIndex = availableForeignKeyIndexDependents.length - 1; dependentIndex >= 0; dependentIndex -= 1) {
                const dependent = availableForeignKeyIndexDependents[dependentIndex];
                if (dependent.indexName !== affectedConstraintKey.backingIndexName) continue;
                availableConstraintNames.delete(`${dependent.tableName}.${dependent.constraintName}`);
                availableForeignKeyIndexDependents.splice(dependentIndex, 1);
              }
            }
            const affectedExclusionOwner = availableExclusionIndexOwners.find((owner) => owner.tableName === targetTable && owner.constraintName === effect.name);
            const affectedForeignKeyDependents = availableForeignKeyIndexDependents.filter((dependent) => dependent.tableName === targetTable && dependent.constraintName === effect.name);
            if (effect.renamedToConstraint) {
              for (const dependent of affectedForeignKeyDependents) dependent.constraintName = effect.renamedToConstraint;
              const renamedBackingIndexName = affectedExclusionOwner?.indexName ?? affectedConstraintKey?.backingIndexName;
              if (renamedBackingIndexName) {
                for (const dependent of availableForeignKeyIndexDependents) {
                  if (dependent.indexName === renamedBackingIndexName) dependent.indexName = effect.renamedToConstraint;
                }
              }
              if (affectedExclusionOwner) {
                const oldIndexName = affectedExclusionOwner.indexName;
                const renamedCatalogIndex = availableCatalogIndexByName.get(oldIndexName);
                availableCatalogIndexByName.delete(oldIndexName);
                if (renamedCatalogIndex) availableCatalogIndexByName.set(effect.renamedToConstraint, renamedCatalogIndex);
                availableRelationKinds.delete(oldIndexName);
                availableIndexParentByName.delete(oldIndexName);
                availableRelationKinds.set(effect.renamedToConstraint, "i");
                availableIndexParentByName.set(effect.renamedToConstraint, targetTable);
                affectedExclusionOwner.indexName = effect.renamedToConstraint;
                affectedExclusionOwner.constraintName = effect.renamedToConstraint;
              }
              if (affectedConstraintKey) {
                const oldBackingIndexName = affectedConstraintKey.backingIndexName ?? null;
                if (oldBackingIndexName) {
                  const renamedCatalogIndex = availableCatalogIndexByName.get(oldBackingIndexName);
                  availableCatalogIndexByName.delete(oldBackingIndexName);
                  if (renamedCatalogIndex) availableCatalogIndexByName.set(effect.renamedToConstraint, renamedCatalogIndex);
                  availableRelationKinds.delete(oldBackingIndexName);
                  availableIndexParentByName.delete(oldBackingIndexName);
                  availableRelationKinds.set(effect.renamedToConstraint, "i");
                  availableIndexParentByName.set(effect.renamedToConstraint, targetTable);
                }
                availableUniqueKeysByTable.set(targetTable, renameFlywayUniqueConstraintKey(
                  uniqueKeys,
                  effect.name,
                  effect.renamedToConstraint,
                  oldBackingIndexName,
                ));
              }
            } else {
              for (const dependent of affectedForeignKeyDependents) {
                availableForeignKeyIndexDependents.splice(availableForeignKeyIndexDependents.indexOf(dependent), 1);
              }
              if (affectedExclusionOwner) {
                availableExclusionIndexOwners.splice(availableExclusionIndexOwners.indexOf(affectedExclusionOwner), 1);
                availableCatalogIndexByName.delete(affectedExclusionOwner.indexName);
                availableRelationKinds.delete(affectedExclusionOwner.indexName);
                availableIndexParentByName.delete(affectedExclusionOwner.indexName);
              }
              if (affectedConstraintKey?.backingIndexName) {
                availableCatalogIndexByName.delete(affectedConstraintKey.backingIndexName);
                availableRelationKinds.delete(affectedConstraintKey.backingIndexName);
                availableIndexParentByName.delete(affectedConstraintKey.backingIndexName);
              }
              availableUniqueKeysByTable.set(targetTable, removeFlywayUniqueKeysForDroppedConstraint(
                uniqueKeys,
                effect.name,
                affectedConstraintKey?.backingIndexName ?? null,
              ));
            }
          }
          if (effect.requiresExistingConstraint && !alreadyExists) {
            pendingAlterObjectStateIssues.push({
              version: migration.version,
              filename: migration.filename,
              targetTable,
              objectKind: "constraint",
              operation: "verify",
              objectName: effect.name,
              problem: "not_found",
            });
          } else if (!effect.requiresExistingConstraint && effect.operation === "present" && alreadyExists) {
            pendingAlterObjectStateIssues.push({
              version: migration.version,
              filename: migration.filename,
              targetTable,
              objectKind: "constraint",
              operation: effect.operation,
              objectName: effect.name,
              problem: "already_exists",
            });
          } else if (!effect.requiresExistingConstraint && effect.operation === "absent" && !alreadyExists && !effect.ifExists) {
            pendingAlterObjectStateIssues.push({
              version: migration.version,
              filename: migration.filename,
              targetTable,
              objectKind: "constraint",
              operation: effect.operation,
              objectName: effect.name,
              problem: "not_found",
            });
          }
          if (!effect.requiresExistingConstraint) {
            if (effect.operation === "present") availableConstraintNames.add(constraintKey);
            else availableConstraintNames.delete(constraintKey);
          }
          if (effect.operation === "present" && effect.uniqueKey && !alreadyExists) {
            const uniqueKeys = availableUniqueKeysByTable.get(targetTable) ?? [];
            uniqueKeys.push({ ...effect.uniqueKey, constraintName: effect.name, backingIndexName: effect.name });
            availableUniqueKeysByTable.set(targetTable, uniqueKeys);
          }
          if (effect.operation === "present" && effect.foreignKeyTarget) {
            const reference = effect.foreignKeyTarget;
            pendingForeignKeyTargets.push({
              version: migration.version,
              filename: migration.filename,
              sourceTable: targetTable,
              localColumns: reference.localColumns,
              targetSchema: reference.targetSchema,
              targetTable: reference.targetTable,
              targetColumns: reference.targetColumns,
            });
            if (reference.targetSchema && reference.targetSchema !== "public") {
              pendingForeignKeyTargetUnverified.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                reason: `ALTER TABLE foreign key references schema ${reference.targetSchema}, outside the public-only catalog audit`,
              });
              continue;
            }
            const localColumns = availableColumnsByTable.get(targetTable);
            if (!localColumns) {
              pendingForeignKeyTargetUnverified.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                reason: "ALTER TABLE foreign key source columns are unavailable from catalog or earlier pending CREATE TABLE/ALTER TABLE source",
              });
              continue;
            }
            const missingLocalColumns = reference.localColumns.filter((column) => !localColumns.has(column));
            if (missingLocalColumns.length > 0) {
              pendingForeignKeyTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                targetKind: availableRelationKinds.get(reference.targetTable) ?? null,
                missingColumns: missingLocalColumns,
                problem: "local_column_missing",
              });
              continue;
            }
            if (!availablePhysicalRelations.has(reference.targetTable)) {
              pendingForeignKeyTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                targetKind: null,
                missingColumns: reference.targetColumns ?? [],
                problem: "target_relation_missing",
              });
              continue;
            }
            const targetColumns = availableColumnsByTable.get(reference.targetTable);
            if (!targetColumns) {
              pendingForeignKeyTargetUnverified.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                reason: "ALTER TABLE foreign key target columns are unavailable from catalog or earlier pending CREATE TABLE source",
              });
              continue;
            }
            const targetUniqueKeys = availableUniqueKeysByTable.get(reference.targetTable);
            const resolvedTargetColumns = reference.targetColumns
              ?? targetUniqueKeys?.find((key) => key.primary && !key.deferrable)?.columns
              ?? null;
            if (resolvedTargetColumns === null) {
              if (targetUniqueKeys) {
                pendingForeignKeyTargetIssues.push({
                  version: migration.version,
                  filename: migration.filename,
                  sourceTable: targetTable,
                  targetTable: reference.targetTable,
                  targetKind: availableRelationKinds.get(reference.targetTable) ?? null,
                  missingColumns: [],
                  problem: "target_primary_key_missing",
                });
              } else {
                pendingForeignKeyTargetUnverified.push({
                  version: migration.version,
                  filename: migration.filename,
                  sourceTable: targetTable,
                  targetTable: reference.targetTable,
                  reason: "ALTER TABLE REFERENCES omits target columns and the referenced primary key could not be resolved",
                });
              }
              continue;
            }
            const missingTargetColumns = resolvedTargetColumns.filter((column) => !targetColumns.has(column));
            if (missingTargetColumns.length > 0) {
              pendingForeignKeyTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                targetKind: availableRelationKinds.get(reference.targetTable) ?? null,
                missingColumns: missingTargetColumns,
                problem: "target_column_missing",
              });
              continue;
            }
            const matchingTargetKeys = targetUniqueKeys?.filter((key) =>
              !key.deferrable
              && matchesFlywayForeignKeyTargetKey(resolvedTargetColumns, key.columns),
            ) ?? [];
            const isUniqueTarget = matchingTargetKeys.length > 0;
            if (!isUniqueTarget) {
              pendingForeignKeyTargetIssues.push({
                version: migration.version,
                filename: migration.filename,
                sourceTable: targetTable,
                targetTable: reference.targetTable,
                targetKind: availableRelationKinds.get(reference.targetTable) ?? null,
                missingColumns: [],
                problem: "target_columns_not_unique",
              });
            } else if (!alreadyExists) {
              for (const key of matchingTargetKeys) {
                const targetIndexName = key.backingIndexName ?? key.indexName ?? null;
                if (!availableForeignKeyIndexDependents.some((dependent) =>
                  dependent.indexName === targetIndexName && dependent.tableName === targetTable && dependent.constraintName === effect.name,
                )) {
                  availableForeignKeyIndexDependents.push({ indexName: targetIndexName, tableName: targetTable, constraintName: effect.name, referencedTable: reference.targetTable, localColumns: reference.localColumns, referencedColumns: resolvedTargetColumns });
                }
              }
            }
          }
          continue;
        }
        if (effect.kind === "index" && effect.operation === "absent") {
          if (blockedIndexDropStatements.has(effect.statementStart ?? -1)) continue;
          const owningConstraintEntry = [...availableUniqueKeysByTable.entries()]
            .map(([tableName, keys]) => ({ tableName, keys, constraint: findFlywayOwningUniqueConstraint(keys, effect.name) }))
            .find(({ constraint }) => constraint !== null);
          if (owningConstraintEntry?.constraint?.constraintName && effect.dropCascade) {
            availableUniqueKeysByTable.set(owningConstraintEntry.tableName, removeFlywayUniqueKeysForDroppedConstraint(
              owningConstraintEntry.keys,
              owningConstraintEntry.constraint.constraintName,
              effect.name,
            ));
            availableConstraintNames.delete(`${owningConstraintEntry.tableName}.${owningConstraintEntry.constraint.constraintName}`);
          }
          const owningExclusionConstraint = findFlywayIndexConstraintOwner(availableExclusionIndexOwners, effect.name);
          if (owningExclusionConstraint && effect.dropCascade) {
            availableExclusionIndexOwners.splice(availableExclusionIndexOwners.indexOf(owningExclusionConstraint), 1);
            availableConstraintNames.delete(`${owningExclusionConstraint.tableName}.${owningExclusionConstraint.constraintName}`);
          }
          if (effect.dropCascade) {
            for (let dependentIndex = availableForeignKeyIndexDependents.length - 1; dependentIndex >= 0; dependentIndex -= 1) {
              const dependent = availableForeignKeyIndexDependents[dependentIndex];
              if (dependent.indexName !== effect.name) continue;
              availableConstraintNames.delete(`${dependent.tableName}.${dependent.constraintName}`);
              availableForeignKeyIndexDependents.splice(dependentIndex, 1);
            }
          }
          availableCatalogIndexByName.delete(effect.name);
          availableRelationKinds.delete(effect.name);
          availableIndexParentByName.delete(effect.name);
          for (const [tableName, keys] of availableUniqueKeysByTable) {
            availableUniqueKeysByTable.set(tableName, keys.filter((key) => key.indexName !== effect.name));
          }
          continue;
        }
        if (effect.kind !== "index" || effect.operation !== "present") continue;
        const targetTable = effect.tableName!;
        if (effect.tableSchemaName && effect.tableSchemaName !== "public") {
          pendingIndexTargetSchemaUnverified.push({
            version: migration.version,
            filename: migration.filename,
            indexName: effect.name,
            targetSchema: effect.tableSchemaName,
            targetTable,
            reason: "index target schema is outside the public-only catalog audit",
          });
          continue;
        }
        if (effect.indexOnly) {
          pendingPartitionedIndexOnlyUnverified.push({ version: migration.version, filename: migration.filename, indexName: effect.name, targetTable });
        }
        if (effect.indexNameGenerated) {
          pendingIndexNameUnverified.push({ version: migration.version, filename: migration.filename, targetTable });
        }
        const existingKind = availableRelationKinds.get(effect.name);
        const existingParentTable = availableIndexParentByName.get(effect.name) ?? null;
        if (!effect.indexNameGenerated && isFlywayIndexNameConflict(existingKind, existingParentTable, targetTable, effect.ifNotExists ?? false)) {
          pendingIndexNameConflicts.push({
            version: migration.version,
            filename: migration.filename,
            indexName: effect.name,
            targetTable: effect.tableName!,
            existingKind: existingKind!,
            existingParentTable,
          });
        }
        const existingIndex = availableCatalogIndexByName.get(effect.name);
        if (!effect.indexNameGenerated && existingIndex && existingKind === "i" && existingParentTable === targetTable) {
          const catalogKeyList = existingIndex.index_definition.match(/\bUSING\s+[\w"]+\s*\(([^()]*)\)/i)?.[1] ?? null;
          const existingKeyTerms = catalogKeyList === null ? null : parseFlywayIndexKeyTerms(catalogKeyList);
          const definitionVerified = isFlywayIndexDefinitionVerified({
            keyTerms: effect.indexKeyTerms ?? null,
            includeColumns: effect.indexIncludeColumns ?? null,
            unverifiedOptions: effect.indexUnverifiedOptions ?? [],
            unique: Boolean(effect.indexUnique),
            nullsNotDistinct: Boolean(effect.indexNullsNotDistinct),
            method: effect.indexMethod ?? "btree",
            hasPredicate: Boolean(effect.indexHasPredicate),
            predicateExpression: effect.indexPredicateExpression ?? null,
          }, {
            keyTerms: existingKeyTerms,
            includeColumns: existingIndex.include_columns,
            unique: existingIndex.is_unique,
            nullsNotDistinct: existingIndex.nulls_not_distinct,
            method: existingIndex.access_method,
            hasPredicate: existingIndex.has_predicate,
            predicateExpression: existingIndex.predicate_expression,
            isValid: existingIndex.is_valid,
            isReady: existingIndex.is_ready,
            isLive: existingIndex.is_live,
          });
          if (!definitionVerified) {
            pendingIndexDefinitionUnverified.push({
              version: migration.version,
              filename: migration.filename,
              indexName: effect.name,
              targetTable: effect.tableName!,
              reason: effect.indexUnverifiedOptions?.length
                ? "source storage parameters or tablespace are not compared"
                : effect.indexHasPredicate || existingIndex.has_predicate
                  ? "partial-index predicate differs, cannot be normalized safely, or was unavailable"
                  : "existing key/include order, method, uniqueness, NULLS NOT DISTINCT behavior, or valid/ready/live state differs from the source definition or could not be parsed",
              sourceKeyTerms: effect.indexKeyTerms ?? null,
              sourceIncludeColumns: effect.indexIncludeColumns ?? null,
              sourcePredicateExpression: effect.indexPredicateExpression ?? null,
              sourceUnverifiedOptions: effect.indexUnverifiedOptions ?? [],
              sourceNullsNotDistinct: Boolean(effect.indexNullsNotDistinct),
              catalogDefinition: existingIndex.index_definition,
              catalogIncludeColumns: existingIndex.include_columns,
              catalogPredicateExpression: existingIndex.predicate_expression,
              catalogUnique: existingIndex.is_unique,
              catalogNullsNotDistinct: existingIndex.nulls_not_distinct,
              catalogMethod: existingIndex.access_method,
              catalogHasPredicate: existingIndex.has_predicate,
              catalogIsValid: existingIndex.is_valid,
              catalogIsReady: existingIndex.is_ready,
              catalogIsLive: existingIndex.is_live,
            });
          }
        }
        availableRelationKinds.set(effect.name, "i");
        availableIndexParentByName.set(effect.name, targetTable);
        if (!availableIndexableRelations.has(targetTable)) {
          const sourceCreator = findFlywayRelationCreationSourceBeforeVersion(migrationSql, targetTable, migration.version);
          const sourceCreatorMigrationState = sourceCreator
            ? classifyFlywayMigrationState(sourceCreator.version, history.rows, report.pending, report.olderUnapplied)
            : null;
          pendingIndexTargetIssues.push({
            version: migration.version,
            filename: migration.filename,
            indexName: effect.name,
            targetTable: effect.tableName!,
            actualParentKind: catalogRelationKinds.get(targetTable) ?? null,
            sourceCreatorVersion: sourceCreator?.version ?? null,
            sourceCreatorFilename: sourceCreator?.filename ?? null,
            sourceCreatorRelationType: sourceCreator?.relationType ?? null,
            sourceCreatorMigrationState,
          });
          if ((sourceCreator?.relationType === "table" || sourceCreator?.relationType === "materialized_view") && sourceCreatorMigrationState === "OLDER_UNAPPLIED") {
            pendingIndexTargetCreatorOlderUnappliedIssues.push({
              version: migration.version,
              filename: migration.filename,
              indexName: effect.name,
              targetTable: effect.tableName!,
              creatorVersion: sourceCreator.version,
              creatorFilename: sourceCreator.filename,
            });
          }
          continue;
        }
        if (effect.indexColumns == null) {
          pendingIndexColumnUnverified.push({ version: migration.version, filename: migration.filename, indexName: effect.name, targetTable: effect.tableName!, reason: "index key expression or syntax is outside the simple-column parser" });
          continue;
        }
        const availableColumns = availableColumnsByTable.get(targetTable);
        if (!availableColumns) {
          pendingIndexColumnUnverified.push({ version: migration.version, filename: migration.filename, indexName: effect.name, targetTable: effect.tableName!, reason: "target table columns are unavailable from the current catalog or parsed pending CREATE TABLE/ALTER TABLE source" });
          continue;
        }
        const missingColumns = effect.indexColumns.filter((column) => !availableColumns.has(column));
        if (missingColumns.length > 0) {
          pendingIndexColumnIssues.push({ version: migration.version, filename: migration.filename, indexName: effect.name, targetTable: effect.tableName!, missingColumns });
          continue;
        }
        const indexNameAvailableForSourceDefinition = !effect.indexNameGenerated && !existingKind;
        if (indexNameAvailableForSourceDefinition && !effect.indexOnly && effect.indexUnique && !effect.indexHasPredicate && effect.indexKeyTerms && effect.indexKeyTerms.length > 0) {
          const keys = availableUniqueKeysByTable.get(targetTable) ?? [];
          availableUniqueKeysByTable.set(targetTable, [
            ...keys.filter((key) => key.indexName !== effect.name),
            {
              columns: effect.indexKeyTerms.map(({ column }) => column),
              primary: false,
              deferrable: false,
              initiallyDeferred: false,
              nullsNotDistinct: Boolean(effect.indexNullsNotDistinct),
              includeColumns: effect.indexIncludeColumns ?? [],
              indexName: effect.name,
            },
          ]);
        }
      }
    }
    const ddlMismatchStateCounts = new Map<string, number>();
    const ddlMismatchVersionCounts = new Map<string, { state: string; count: number }>();
    for (const mismatch of ddlInventory.mismatches) {
      const state = classifyFlywayMigrationState(mismatch.declaredBy.version, history.rows, report.pending, report.olderUnapplied);
      ddlMismatchStateCounts.set(state, (ddlMismatchStateCounts.get(state) ?? 0) + 1);
      const versionSummary = ddlMismatchVersionCounts.get(mismatch.declaredBy.version) ?? { state, count: 0 };
      versionSummary.count += 1;
      ddlMismatchVersionCounts.set(mismatch.declaredBy.version, versionSummary);
    }
    const missingOperationalNames = [...schemaHealth.missingOperationalTables, ...schemaHealth.missingOperationalViews];
    const sourceRelationDeclarations = migrationSql.flatMap((migration) =>
      Array.from(migration.sql.matchAll(/\bCREATE\s+(TABLE|(?:OR\s+REPLACE\s+)?VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi))
        .map((match) => ({
          name: normalizeFlywayIdentifier(match[2]),
          kind: /VIEW/i.test(match[1]) ? "view" : "table",
          migration,
        })),
    );
    const missingOperationalRelations = missingOperationalNames.map((name) => {
      const declarations = sourceRelationDeclarations.filter((declaration) => declaration.name === name);
      const sourceDecl = declarations.at(-1);
      return {
        name,
        actualKind: catalogRelationKinds.get(name) ?? null,
        sourceDeclaredKind: sourceDecl?.kind ?? null,
        sourceDeclaredBy: sourceDecl ? { version: sourceDecl.migration.version, filename: sourceDecl.migration.filename } : null,
        sourceDeclarations: declarations.map(({ kind, migration }) => ({ kind, version: migration.version, filename: migration.filename })),
      };
    });
    const relevantMigrationVersions = new Set(missingOperationalRelations.flatMap((relation) =>
      relation.sourceDeclarations.map(({ version }) => version),
    ));
    for (const missingColumn of schemaHealth.missingOperationalColumns) {
      const [tableName, columnName] = missingColumn.split(".");
      for (const mismatch of ddlInventory.mismatches) {
        if (mismatch.kind === "column" && mismatch.tableName === tableName && mismatch.name === columnName) {
          relevantMigrationVersions.add(mismatch.declaredBy.version);
        }
      }
    }
    const failureReasons = [
      ...(report.drift ? ["FLYWAY_HISTORY_DRIFT"] : []),
      ...(!migrationValidation.ok ? ["FLYWAY_VALIDATION_DRIFT"] : []),
      ...(pendingConcurrentIndexConfigIssues.length > 0 ? ["PENDING_CONCURRENT_INDEX_TRANSACTION_CONFIG_MISSING"] : []),
      ...(pendingConcurrentIndexTransactionBlockIssues.length > 0 ? ["PENDING_CONCURRENT_INDEX_EXPLICIT_TRANSACTION_BLOCK"] : []),
      ...(pendingIndexNameConflicts.length > 0 ? ["PENDING_MIGRATION_INDEX_NAME_CONFLICT"] : []),
      ...(pendingIndexConstraintDropIssues.length > 0 ? ["PENDING_MIGRATION_INDEX_OWNED_BY_CONSTRAINT"] : []),
      ...(pendingIndexReferencedByForeignKeyIssues.length > 0 ? ["PENDING_MIGRATION_INDEX_REFERENCED_BY_FOREIGN_KEY"] : []),
      ...(pendingUniqueConstraintDropDependencyIssues.length > 0 ? ["PENDING_MIGRATION_UNIQUE_CONSTRAINT_REFERENCED_BY_FOREIGN_KEY"] : []),
      ...(pendingIndexCascadeUnverified.length > 0 ? ["PENDING_MIGRATION_INDEX_CASCADE_UNVERIFIED"] : []),
      ...(pendingConcurrentIndexDropMultiTargetIssues.length > 0 ? ["PENDING_MIGRATION_CONCURRENT_INDEX_DROP_MULTIPLE_TARGETS"] : []),
      ...(pendingConcurrentIndexDropCascadeIssues.length > 0 ? ["PENDING_MIGRATION_CONCURRENT_INDEX_DROP_CASCADE_UNSUPPORTED"] : []),
      ...(pendingConcurrentIndexDropPartitionedTableIssues.length > 0 ? ["PENDING_MIGRATION_CONCURRENT_INDEX_DROP_PARTITIONED_TABLE_UNSUPPORTED"] : []),
      ...(pendingIndexNameUnverified.length > 0 ? ["PENDING_MIGRATION_INDEX_NAME_UNVERIFIED"] : []),
      ...(pendingPartitionedIndexOnlyUnverified.length > 0 ? ["PENDING_PARTITIONED_INDEX_ONLY_UNVERIFIED"] : []),
      ...(pendingIndexDefinitionUnverified.length > 0 ? ["PENDING_MIGRATION_INDEX_DEFINITION_UNVERIFIED"] : []),
      ...(pendingIndexTargetIssues.length > 0 ? ["PENDING_MIGRATION_INDEX_TARGET_MISSING"] : []),
      ...(pendingIndexTargetSchemaUnverified.length > 0 ? ["PENDING_MIGRATION_INDEX_TARGET_SCHEMA_UNVERIFIED"] : []),
      ...(pendingIndexSchemaUnverified.length > 0 ? ["PENDING_MIGRATION_INDEX_SCHEMA_UNVERIFIED"] : []),
      ...(pendingIndexTargetCreatorOlderUnappliedIssues.length > 0 ? ["PENDING_MIGRATION_INDEX_TARGET_CREATOR_OLDER_UNAPPLIED"] : []),
      ...(pendingIndexTargetsDroppedBySourceHistory.length > 0 ? ["PENDING_MIGRATION_INDEX_TARGET_DROPPED_BY_SOURCE_HISTORY"] : []),
      ...(pendingIndexColumnIssues.length > 0 ? ["PENDING_MIGRATION_INDEX_COLUMN_MISSING"] : []),
      ...(pendingRelationRenameIssues.length > 0 ? ["PENDING_MIGRATION_RELATION_RENAME_CONFLICT"] : []),
      ...(pendingRelationSchemaUnverified.length > 0 ? ["PENDING_MIGRATION_RELATION_SCHEMA_UNVERIFIED"] : []),
      ...(pendingRelationCascadeUnverified.length > 0 ? ["PENDING_MIGRATION_RELATION_CASCADE_DEPENDENCIES_UNVERIFIED"] : []),
      ...(pendingRelationReferencedByForeignKeyIssues.length > 0 ? ["PENDING_MIGRATION_RELATION_REFERENCED_BY_FOREIGN_KEY"] : []),
      ...(pendingColumnReferencedByForeignKeyIssues.length > 0 ? ["PENDING_MIGRATION_COLUMN_REFERENCED_BY_FOREIGN_KEY"] : []),
      ...(pendingSchemaDropUnverified.length > 0 ? ["PENDING_MIGRATION_SCHEMA_DROP_UNVERIFIED"] : []),
      ...(pendingPublicSchemaRenameUnverified.length > 0 ? ["PENDING_MIGRATION_PUBLIC_SCHEMA_RENAME_UNVERIFIED"] : []),
      ...(pendingTypeCascadeDropUnverified.length > 0 ? ["PENDING_MIGRATION_TYPE_CASCADE_UNVERIFIED"] : []),
      ...(pendingDomainCascadeDropUnverified.length > 0 ? ["PENDING_MIGRATION_DOMAIN_CASCADE_UNVERIFIED"] : []),
      ...(pendingDropOwnedUnverified.length > 0 ? ["PENDING_MIGRATION_DROP_OWNED_UNVERIFIED"] : []),
      ...(pendingAlterObjectSchemaUnverified.length > 0 ? ["PENDING_MIGRATION_ALTER_OBJECT_SCHEMA_UNVERIFIED"] : []),
      ...(pendingAlterDropDependenciesUnverified.length > 0 ? ["PENDING_MIGRATION_ALTER_DROP_DEPENDENCIES_UNVERIFIED"] : []),
      ...(pendingAlterUniqueKeyUnverified.length > 0 ? ["PENDING_MIGRATION_ALTER_UNIQUE_KEY_UNVERIFIED"] : []),
      ...(pendingUnmodeledAlterUniqueKeys.length > 0 ? ["PENDING_MIGRATION_UNMODELED_ALTER_UNIQUE_KEY"] : []),
      ...(pendingAlterTargetIssues.length > 0 ? ["PENDING_MIGRATION_ALTER_TARGET_MISSING"] : []),
      ...(pendingAlterObjectStateIssues.length > 0 ? ["PENDING_MIGRATION_ALTER_OBJECT_STATE_CONFLICT"] : []),
      ...(pendingAlterObjectStateUnverified.length > 0 ? ["PENDING_MIGRATION_ALTER_OBJECT_STATE_UNVERIFIED"] : []),
      ...(pendingCreateTableRelationKindIssues.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_RELATION_KIND_MISMATCH"] : []),
      ...(pendingCreateTableDefinitionUnverified.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_DEFINITION_UNVERIFIED"] : []),
      ...(pendingCreateTableColumnIssues.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_COLUMNS_MISSING"] : []),
      ...(pendingCreateTableConstraintIssues.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_MISMATCH"] : []),
      ...(pendingCreateTableConstraintUnverified.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_UNVERIFIED"] : []),
      ...(pendingCreateTableForeignKeyIssues.length > 0 ? ["PENDING_MIGRATION_CREATE_TABLE_FOREIGN_KEY_MISSING"] : []),
      ...(pendingForeignKeyTargetIssues.length > 0 ? ["PENDING_MIGRATION_FOREIGN_KEY_TARGET_MISSING"] : []),
      ...(pendingForeignKeyTargetUnverified.length > 0 ? ["PENDING_MIGRATION_FOREIGN_KEY_TARGET_UNVERIFIED"] : []),
      ...(invalidCatalogIndexes.length > 0 ? ["INVALID_CATALOG_INDEX_STATE"] : []),
      ...(!schemaHealth.schemaReady ? ["OPERATIONAL_SCHEMA_NOT_READY"] : []),
    ];
    console.info(`[flyway-history-audit] ${JSON.stringify({
      databaseHost,
      readOnly: true,
      appliedLatest: report.appliedLatest,
      sourceLatest: report.sourceLatest,
      appliedMigrationCount: report.appliedMigrationCount,
      sourceMigrationCount: report.sourceMigrationCount,
      pendingCount: report.pending.length,
      pendingSample: report.pending.slice(0, 10).map(({ version, filename }) => ({ version, filename })),
      olderUnappliedCount: report.olderUnapplied.length,
      olderUnappliedSample: report.olderUnapplied.slice(0, 10).map(({ version, filename }) => ({ version, filename })),
      failed: report.failed.map(({ version, script }) => ({ version, script })),
      migrationValidation,
      historyDrift: report.drift,
      drift: report.drift || !migrationValidation.ok,
      schemaReady: schemaHealth.schemaReady,
      failureReasons,
      migrationStateNote: "History drift means a source version above appliedLatest is pending or a history row failed. Validation drift means an applied migration is unresolved or its description, type, or SQL CRC32 checksum differs from source. Older unapplied versions are advisory and do not cause history drift alone; their history absence does not prove their schema effects are absent. Flyway outOfOrder defaults to false.",
      splitMigrationPreflight: splitPreflight,
      preflightNote: "Structural checks only; not approval to execute migrations. Row estimates are approximate. V85/V89 delete or rename data relations.",
      operationalSchema: {
        ready: schemaHealth.schemaReady,
        missingOperationalTables: schemaHealth.missingOperationalTables,
        missingOperationalViews: schemaHealth.missingOperationalViews,
        missingOperationalColumns: schemaHealth.missingOperationalColumns,
        operationalColumnShapeIssues: schemaHealth.operationalColumnShapeIssues,
        operationalPrimaryKeyIssues: schemaHealth.operationalPrimaryKeyIssues,
        operationalIndexIssues: schemaHealth.operationalIndexIssues,
        missingOperationalRelations,
        retiredTablesPresent: schemaHealth.retiredTablesPresent,
      },
      relevantMigrationHistory: [...relevantMigrationVersions].map((version) => {
        const historyRows = history.rows.filter((row) => String(row.version) === version);
        const state = classifyFlywayMigrationState(version, history.rows, report.pending, report.olderUnapplied);
        return {
          version,
          sourceFilename: migrationSql.find((migration) => migration.version === version)?.filename ?? null,
          state,
          historyRows,
          validationIssues: migrationValidation.issues.filter((issue) => issue.version === version),
        };
      }),
      ddlInventory,
      ddlInventoryMismatchMigrationStates: [...ddlMismatchStateCounts].map(([state, mismatchCount]) => ({ state, mismatchCount })),
      ddlInventoryMismatchVersions: [...ddlMismatchVersionCounts].map(([version, summary]) => ({ version, state: summary.state, mismatchCount: summary.count })),
      pendingIndexTargetIssues,
      pendingIndexTargetSchemaUnverified,
      pendingIndexSchemaUnverified,
      pendingIndexTargetCreatorOlderUnappliedIssues,
      pendingIndexTargetsDroppedBySourceHistory,
      pendingIndexColumnIssues,
      pendingIndexColumnUnverified,
      pendingRelationRenameIssues,
      pendingRelationSchemaUnverified,
      pendingRelationCascadeUnverified,
      pendingRelationReferencedByForeignKeyIssues,
      pendingColumnReferencedByForeignKeyIssues,
      pendingSchemaDropUnverified,
      pendingPublicSchemaRenameUnverified,
      pendingTypeCascadeDropUnverified,
      pendingDomainCascadeDropUnverified,
      pendingDropOwnedUnverified,
      pendingAlterObjectSchemaUnverified,
      pendingAlterDropDependenciesUnverified,
      pendingAlterUniqueKeyUnverified,
      pendingUnmodeledAlterUniqueKeys,
      pendingAlterTargetIssues,
      pendingAlterEffects,
      pendingAlterEffectCount: pendingAlterEffects.length,
      pendingAlterObjectStateIssues,
      pendingAlterObjectStateUnverified,
      pendingCreateTableRelationKindIssues,
      pendingCreateTableDefinitionUnverified,
      pendingCreateTableColumnIssues,
      pendingCreateTableColumnUnverified,
      pendingCreateTableForeignKeyIssues,
      pendingCreateTableConstraintIssues,
      pendingCreateTableConstraintUnverified,
      pendingForeignKeyTargetIssues,
      pendingForeignKeyTargetUnverified,
      pendingForeignKeyTargets,
      invalidCatalogIndexes,
      pendingIndexNameConflicts,
      pendingIndexConstraintDropIssues,
      pendingIndexReferencedByForeignKeyIssues,
      pendingUniqueConstraintDropDependencyIssues,
      pendingIndexCascadeUnverified,
      pendingConcurrentIndexDropMultiTargetIssues,
      pendingConcurrentIndexDropCascadeIssues,
      pendingConcurrentIndexDropPartitionedTableIssues,
      pendingIndexNameUnverified,
      pendingPartitionedIndexOnlyUnverified,
      pendingIndexDefinitionUnverified,
      pendingConcurrentIndexConfigIssues,
      pendingConcurrentIndexTransactionBlockIssues,
      pendingIndexTargetNote: "For higher-version pending migrations, target relations and simple key columns are checked against the current catalog plus columns declared by earlier pending CREATE TABLE and ALTER TABLE ADD/DROP/RENAME COLUMN statements. Expressions and complex key syntax are reported as unverified. Permissions, locks, and data preconditions are not assessed.",
      ddlInventoryScope: "DDL object inventory parses CREATE/DROP relation, index and sequence plus ALTER TABLE table/column/constraint renames, column/constraint add/drop, ALTER ADD CONSTRAINT foreign-key targets, and referenced-object presence for ALTER COLUMN, ALTER CONSTRAINT, and VALIDATE CONSTRAINT actions. Pending table rename simulation carries columns, constraints, and index parent ownership to the target name and reports missing sources or occupied targets. Pending CREATE TABLE named constraints are carried into later source-order ALTER checks. Explicit foreign-key references outside public are reported as unverified because the audit catalog is public-only. Pending DROP TABLE/MATERIALIZED VIEW CASCADE dependency removals are reported as unverified because dependent relation effects are outside the modeled source inventory. Definitions and validation state themselves, full column/constraint/index definitions, conditional or dynamic DDL outside modeled IF EXISTS cases, and data-operation outcomes are not verified. Use migration validation, operational schema health and targeted catalog checks for those guarantees.",
    })}`);
    if (failureReasons.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[flyway-history-audit-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
