import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditFlywayDdlInventory, auditFlywayHistory, auditFlywayIndexTargetsAgainstSourceHistory, auditUniverseSplitPreconditions, classifyFlywayMigrationState, compareFlywayCheckExpressions, extractFlywayCheckExpression, findFlywayColumnDropForeignKeyDependencyIssues, findFlywayColumnDropForeignKeyDependents, findFlywayConcurrentIndexTransactionBlockStatementStarts, findFlywayDomainCascadeDropEffects, findFlywayDropOwnedEffects, findFlywayIndexConstraintOwner, findFlywayIndexForeignKeyDependents, findFlywayOwningUniqueConstraint, findFlywayRelationCreationSourceBeforeVersion, findFlywayRelationDropForeignKeyDependencyIssues, findFlywayRelationDropForeignKeyDependents, findFlywaySchemaDropEffects, findFlywaySchemaRenameEffects, findFlywayTypeCascadeDropEffects, findFlywayUnmodeledAlterUniqueKeyEffects, findFlywayUniqueConstraintDropForeignKeyDependencyIssues, findFlywayUniqueConstraintDropForeignKeyDependents, hasExplicitNonTransactionalFlywayScriptConfig, hasFlywayConcurrentIndexOperation, hasTopLevelSqlKeyword, isFlywayIndexDefinitionVerified, isFlywayIndexNameConflict, matchesFlywayForeignKeyTargetKey, normalizeFlywayCheckExpression, parseFlywayCreateTableColumns, parseFlywayCreateTableSpecialDefinitions, parseFlywayDdlEffects, parseFlywayIndexKeyTerms, parseFlywayMigrationFiles, removeFlywayUniqueKeysForDroppedConstraint, renameFlywayUniqueConstraintKey } from "./flyway-history-audit";

describe("flyway-history-audit", () => {
  it("removes a dropped unique constraint and its owned index without removing independent unique indexes", () => {
    const remaining = removeFlywayUniqueKeysForDroppedConstraint([
      { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "items_pkey", backingIndexName: "items_pkey" },
      { columns: ["id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "items_pkey" },
      { columns: ["external_id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "items_external_id_uidx" },
    ], "items_pkey", "items_pkey");

    expect(remaining).toEqual([
      { columns: ["external_id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "items_external_id_uidx" },
    ]);
  });

  it("renames a unique constraint and its owned index in the source-order key map", () => {
    const renamed = renameFlywayUniqueConstraintKey([
      { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "old_pk", backingIndexName: "old_pk" },
      { columns: ["id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "old_pk" },
      { columns: ["external_id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "independent_uidx" },
    ], "old_pk", "new_pk", "old_pk");

    expect(renamed).toEqual([
      { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "new_pk", backingIndexName: "new_pk" },
      { columns: ["id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "new_pk" },
      { columns: ["external_id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "independent_uidx" },
    ]);
  });

  it("keeps a renamed primary key available to a later FK in the same migration", () => {
    const migration = {
      version: "9934",
      filename: "V9934__rename_primary_key_before_foreign_key.sql",
      sql: "ALTER TABLE parents RENAME CONSTRAINT parents_pkey TO parents_id_pk; ALTER TABLE children ADD CONSTRAINT children_parent_fk FOREIGN KEY (parent_id) REFERENCES parents (id);",
    };
    const [renameOld, renameNew, foreignKey] = parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint");
    const initialKeys = [
      { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "parents_pkey", backingIndexName: "parents_pkey" },
      { columns: ["id"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "parents_pkey" },
    ];
    const afterRename = renameFlywayUniqueConstraintKey(initialKeys, renameOld.name, renameOld.renamedToConstraint!, "parents_pkey");

    expect(renameNew).toMatchObject({ name: "parents_id_pk", renamedFromConstraint: "parents_pkey" });
    expect(foreignKey.foreignKeyTarget).toMatchObject({ targetTable: "parents", targetColumns: ["id"] });
    expect(afterRename.some((key) => key.primary && key.constraintName === "parents_id_pk")).toBe(true);
    expect(matchesFlywayForeignKeyTargetKey(foreignKey.foreignKeyTarget!.targetColumns!, afterRename[0].columns)).toBe(true);
  });

  it("distinguishes CREATE INDEX IF NOT EXISTS from a duplicate plain CREATE INDEX", () => {
    const effects = parseFlywayDdlEffects({
      version: "9935",
      filename: "V9935__index_if_not_exists.sql",
      sql: "CREATE INDEX IF NOT EXISTS existing_idx ON rows (id); CREATE INDEX duplicate_idx ON rows (id);",
    }).filter(({ kind }) => kind === "index");

    expect(effects).toMatchObject([
      { name: "existing_idx", ifNotExists: true, tableName: "rows" },
      { name: "duplicate_idx", tableName: "rows" },
    ]);
    expect(effects[1]).not.toHaveProperty("ifNotExists");
    expect(isFlywayIndexNameConflict("i", "rows", "rows", false)).toBe(true);
    expect(isFlywayIndexNameConflict("i", "rows", "rows", true)).toBe(false);
    expect(isFlywayIndexNameConflict("i", "other_rows", "rows", true)).toBe(true);
  });

  it("identifies index drops that target an index owned by a unique constraint", () => {
    const keys = [
      { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "parents_pkey", backingIndexName: "parents_pkey" },
      { columns: ["slug"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], indexName: "parents_slug_uidx" },
    ];

    expect(findFlywayOwningUniqueConstraint(keys, "parents_pkey")).toMatchObject({ constraintName: "parents_pkey" });
    expect(findFlywayOwningUniqueConstraint(keys, "parents_slug_uidx")).toBeNull();
    expect(findFlywayIndexConstraintOwner([{ indexName: "room_overlap", tableName: "reservations", constraintName: "room_overlap" }], "room_overlap"))
      .toMatchObject({ tableName: "reservations", constraintName: "room_overlap" });
    expect(findFlywayIndexConstraintOwner([], "room_overlap")).toBeNull();
    expect(findFlywayIndexForeignKeyDependents([
      { indexName: "external_id_uidx", tableName: "orders", constraintName: "orders_customer_fk" },
      { indexName: "external_id_uidx", tableName: "invoices", constraintName: "invoices_customer_fk" },
      { indexName: "other_uidx", tableName: "events", constraintName: "events_tenant_fk" },
    ], "external_id_uidx")).toEqual([
      { indexName: "external_id_uidx", tableName: "orders", constraintName: "orders_customer_fk" },
      { indexName: "external_id_uidx", tableName: "invoices", constraintName: "invoices_customer_fk" },
    ]);
    expect(findFlywayUniqueConstraintDropForeignKeyDependents(keys, "parents_pkey", [
      { indexName: "parents_pkey", tableName: "children", constraintName: "children_parent_fk" },
      { indexName: "unused_idx", tableName: "other_rows", constraintName: "other_fk" },
    ])).toEqual([{ indexName: "parents_pkey", tableName: "children", constraintName: "children_parent_fk" }]);
    expect(findFlywayUniqueConstraintDropForeignKeyDependents(keys, "missing_constraint", [])).toEqual([]);
    const keyWithoutKnownBackingIndex = [{ columns: ["tenant_id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "tenants_pk" }];
    expect(findFlywayUniqueConstraintDropForeignKeyDependents(keyWithoutKnownBackingIndex, "tenants_pk", [
      { indexName: null, tableName: "child_rows", constraintName: null, referencedTable: "tenants" },
      { indexName: null, tableName: "unrelated_rows", constraintName: null, referencedTable: "accounts" },
    ], "tenants")).toEqual([
      { indexName: null, tableName: "child_rows", constraintName: null, referencedTable: "tenants" },
    ]);
    expect(parseFlywayDdlEffects({ version: "9936", filename: "V9936__drop_pk_index.sql", sql: "DROP INDEX parents_pkey;" })).toMatchObject([
      { kind: "index", operation: "absent", name: "parents_pkey" },
    ]);
    expect(parseFlywayDdlEffects({
      version: "9937",
      filename: "V9937__drop_index_options.sql",
      sql: "DROP INDEX CONCURRENTLY IF EXISTS parents_pkey; DROP INDEX parents_pkey CASCADE; DROP INDEX archive.parents_pkey; DROP INDEX public.parents_pkey; DROP INDEX first_idx, second_idx CASCADE; DROP INDEX CONCURRENTLY first_idx, second_idx; DROP INDEX CONCURRENTLY invalid_combo_idx CASCADE; DROP INDEX \"archive.dot\".\"idx,comma\", public.second_idx RESTRICT;",
    }).filter(({ kind }) => kind === "index")).toMatchObject([
      { name: "parents_pkey", ifExists: true, indexConcurrently: true },
      { name: "parents_pkey", dropCascade: true },
      { name: "parents_pkey", schemaName: "archive" },
      { name: "parents_pkey", schemaName: "public" },
      { name: "first_idx", dropCascade: true, indexDropTargetCount: 2 },
      { name: "second_idx", dropCascade: true, indexDropTargetCount: 2 },
      { name: "first_idx", indexConcurrently: true, indexDropTargetCount: 2 },
      { name: "second_idx", indexConcurrently: true, indexDropTargetCount: 2 },
      { name: "invalid_combo_idx", indexConcurrently: true, dropCascade: true, indexConcurrentDropCascadeUnsupported: true },
      { name: "idx,comma", schemaName: "archive.dot", indexDropTargetCount: 2 },
      { name: "second_idx", schemaName: "public", indexDropTargetCount: 2 },
    ]);
    const drops = parseFlywayDdlEffects({ version: "9936", filename: "V9936__multi_drop.sql", sql: "DROP INDEX first_idx, second_idx CASCADE;" }).filter(({ kind }) => kind === "index");
    expect(drops[0].statementStart).toBe(drops[1].statementStart);
  });

  it("preflights constraint drops against FK dependencies in ALTER action order", () => {
    const parentKey = { columns: ["id"], primary: true, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [], constraintName: "parents_pkey", backingIndexName: "parents_pkey" };
    const uniqueKeys = new Map([["parents", [parentKey]]]);
    const dependents = [{ indexName: "parents_pkey", tableName: "parents", constraintName: "parents_self_fk", referencedTable: "parents", localColumns: ["manager_id"], referencedColumns: ["id"] }];
    const parsedDrops = parseFlywayDdlEffects({
      version: "9939",
      filename: "V9939__drop_self_fk_then_pk.sql",
      sql: "ALTER TABLE parents DROP CONSTRAINT parents_self_fk, DROP CONSTRAINT parents_pkey;",
    }).filter(({ kind, operation }) => kind === "constraint" && operation === "absent");
    expect(parsedDrops.map(({ name }) => name)).toEqual(["parents_self_fk", "parents_pkey"]);

    expect(findFlywayUniqueConstraintDropForeignKeyDependencyIssues(parsedDrops.map((drop) => ({
      name: drop.name,
      tableName: drop.tableName!,
      statementStart: drop.statementStart!,
      dropCascade: drop.dropCascade,
      renamedToConstraint: drop.renamedToConstraint,
      requiresExistingConstraint: drop.requiresExistingConstraint,
    })), uniqueKeys, dependents)).toEqual([]);
    expect(findFlywayUniqueConstraintDropForeignKeyDependencyIssues([
      { name: "parents_pkey", tableName: "parents", statementStart: 0 },
      { name: "parents_self_fk", tableName: "parents", statementStart: 0 },
    ], uniqueKeys, dependents)).toEqual([{
      statementStart: 0,
      tableName: "parents",
      constraintName: "parents_pkey",
      backingIndexName: "parents_pkey",
      referencingTable: "parents",
      referencingConstraint: "parents_self_fk",
    }]);
    expect(dependents).toHaveLength(1);
  });

  it("finds external FK dependents of a dropped table but ignores tables dropped in the same statement", () => {
    const dependents = [
      { indexName: "parents_pkey", tableName: "children", constraintName: "children_parent_fk", referencedTable: "parents" },
      { indexName: "children_pkey", tableName: "parents", constraintName: "parents_child_fk", referencedTable: "children" },
      { indexName: "accounts_pkey", tableName: "invoices", constraintName: "invoices_account_fk", referencedTable: "accounts" },
    ];
    expect(findFlywayRelationDropForeignKeyDependents(dependents, "parents", new Set(["parents", "children"]))).toEqual([]);
    expect(findFlywayRelationDropForeignKeyDependents(dependents, "accounts", new Set(["accounts"]))).toEqual([dependents[2]]);
    const dropEffects = parseFlywayDdlEffects({
      version: "9938",
      filename: "V9938__drop_referenced_tables.sql",
      sql: "DROP TABLE parents, children; DROP TABLE accounts RESTRICT; DROP TABLE standalone CASCADE;",
    }).filter(({ kind }) => kind === "relation");
    expect(dropEffects[0].statementStart).toBe(dropEffects[1].statementStart);
    expect(dropEffects).toMatchObject([
      { name: "parents", relationType: "any", statementStart: expect.any(Number) },
      { name: "children", relationType: "any", statementStart: expect.any(Number) },
      { name: "accounts", statementStart: expect.any(Number) },
      { name: "standalone", dropCascade: true, statementStart: expect.any(Number) },
    ]);
    expect(findFlywayRelationDropForeignKeyDependencyIssues(
      dropEffects.filter(({ dropCascade, statementStart }) => !dropCascade && statementStart !== undefined)
        .map(({ name, statementStart, schemaName }) => ({ name, statementStart: statementStart!, schemaName })),
      dependents,
    )).toEqual([{
      statementStart: dropEffects[2].statementStart,
      relationName: "accounts",
      referencingTable: "invoices",
      constraintName: "invoices_account_fk",
    }]);
  });

  it("finds FK dependencies for dropped referenced columns and local FK columns", () => {
    const dependents = [
      { indexName: "parents_pkey", tableName: "children", constraintName: "children_parent_fk", referencedTable: "parents", localColumns: ["parent_id"], referencedColumns: ["id"] },
      { indexName: "tenants_pkey", tableName: "children", constraintName: "children_tenant_fk", referencedTable: "tenants", localColumns: ["tenant_id"], referencedColumns: ["id"] },
      { indexName: "parents_pkey", tableName: "parents", constraintName: "parents_self_fk", referencedTable: "parents", localColumns: ["manager_id"], referencedColumns: ["id"] },
    ];

    expect(findFlywayColumnDropForeignKeyDependents(dependents, "parents", "id")).toEqual([dependents[0], dependents[2]]);
    expect(findFlywayColumnDropForeignKeyDependents(dependents, "children", "parent_id")).toEqual([dependents[0]]);
    expect(findFlywayColumnDropForeignKeyDependents(dependents, "parents", "name")).toEqual([]);
  });

  it("only blocks RESTRICT column drops for public external FK dependencies", () => {
    const dependent = { indexName: "parents_key", tableName: "children", constraintName: "children_parent_fk", referencedTable: "parents", localColumns: ["parent_id"], referencedColumns: ["id", "tenant_id"] };
    const baseDrops = [
      { name: "id", tableName: "parents", statementStart: 12, dropCascade: true },
      { name: "name", tableName: "parents", statementStart: 12 },
    ];

    expect(findFlywayColumnDropForeignKeyDependencyIssues(baseDrops, [dependent])).toEqual([]);
    expect(findFlywayColumnDropForeignKeyDependencyIssues([
      { name: "tenant_id", tableName: "parents", statementStart: 13 },
    ], [dependent])).toEqual([{
      statementStart: 13,
      tableName: "parents",
      columnName: "tenant_id",
      referencingTable: "children",
      constraintName: "children_parent_fk",
    }]);
    expect(findFlywayColumnDropForeignKeyDependencyIssues([
      { name: "id", tableName: "parents", statementStart: 14, tableSchemaName: "archive" },
    ], [dependent])).toEqual([]);
  });

  it("requires non-transactional Flyway configuration for concurrent create and drop index statements", () => {
    expect(hasFlywayConcurrentIndexOperation({
      version: "9938",
      filename: "V9938__concurrent_drop.sql",
      sql: "-- CREATE INDEX CONCURRENTLY ignored_idx ON rows (id);\nSELECT 'DROP INDEX CONCURRENTLY ignored_idx'; DROP INDEX CONCURRENTLY live_idx;",
    })).toBe(true);
    expect(hasFlywayConcurrentIndexOperation({
      version: "9939",
      filename: "V9939__ordinary_index.sql",
      sql: "SELECT 'CREATE INDEX CONCURRENTLY ignored_idx ON rows (id)'; CREATE INDEX live_idx ON rows (id);",
    })).toBe(false);
  });

  it("accepts only one explicit executeInTransaction=false script setting", () => {
    expect(hasExplicitNonTransactionalFlywayScriptConfig("# generated config\nplaceholderReplacement=false\nexecuteInTransaction=false\n")).toBe(true);
    expect(hasExplicitNonTransactionalFlywayScriptConfig("executeInTransaction=false\nexecuteInTransaction=true\n")).toBe(false);
    expect(hasExplicitNonTransactionalFlywayScriptConfig("executeInTransaction=true\nexecuteInTransaction=false\n")).toBe(false);
    expect(hasExplicitNonTransactionalFlywayScriptConfig("executeInTransaction=false # duplicate?\n")).toBe(false);
    expect(hasExplicitNonTransactionalFlywayScriptConfig("# executeInTransaction=false\n")).toBe(false);
  });

  it("detects concurrent index operations inside explicit transaction blocks", () => {
    expect(findFlywayConcurrentIndexTransactionBlockStatementStarts({
      version: "9940",
      filename: "V9940__explicit_transaction.sql",
      sql: "BEGIN; CREATE INDEX CONCURRENTLY live_idx ON rows (id); COMMIT; START TRANSACTION; DROP INDEX CONCURRENTLY stale_idx; ROLLBACK;",
    })).toEqual([6, 82]);
    expect(findFlywayConcurrentIndexTransactionBlockStatementStarts({
      version: "9941",
      filename: "V9941__transaction_masking.sql",
      sql: "SELECT 'BEGIN; DROP INDEX CONCURRENTLY fake_idx'; -- BEGIN;\nDROP INDEX CONCURRENTLY live_idx;",
    })).toEqual([]);
    expect(findFlywayConcurrentIndexTransactionBlockStatementStarts({
      version: "9942",
      filename: "V9942__transaction_chain.sql",
      sql: "BEGIN; COMMIT AND CHAIN; DROP INDEX CONCURRENTLY chained_idx; COMMIT;",
    })).toHaveLength(1);
    expect(findFlywayConcurrentIndexTransactionBlockStatementStarts({
      version: "9943",
      filename: "V9943__rollback_to_savepoint.sql",
      sql: "BEGIN; SAVEPOINT before_drop; ROLLBACK TO SAVEPOINT before_drop; DROP INDEX CONCURRENTLY still_blocked_idx; ROLLBACK;",
    })).toHaveLength(1);
  });

  it("detects pending DROP SCHEMA targets and CASCADE while ignoring comments and literals", () => {
    const migrations = [{
      version: "9930",
      filename: "V9930__drop_archive_schema.sql",
      sql: "-- DROP SCHEMA fake CASCADE\nSELECT 'DROP SCHEMA literal CASCADE'; DROP SCHEMA IF EXISTS \"old,schema\", archive CASCADE;",
    }];

    expect(findFlywaySchemaDropEffects(migrations)).toEqual([{
      version: "9930",
      filename: "V9930__drop_archive_schema.sql",
      schemaNames: ["old,schema", "archive"],
      ifExists: true,
      cascade: true,
    }]);
  });

  it("detects schema renames crossing the public catalog boundary", () => {
    const migrations = [{
      version: "9931",
      filename: "V9931__rename_public_schema.sql",
      sql: "SELECT 'ALTER SCHEMA public RENAME TO ignored'; ALTER /* comment */ SCHEMA archive RENAME TO public; ALTER SCHEMA \"public\" RENAME TO \"archive\";",
    }];

    expect(findFlywaySchemaRenameEffects(migrations)).toEqual([
      { version: "9931", filename: "V9931__rename_public_schema.sql", sourceSchema: "archive", targetSchema: "public" },
      { version: "9931", filename: "V9931__rename_public_schema.sql", sourceSchema: "public", targetSchema: "archive" },
    ]);
  });

  it("detects DROP TYPE CASCADE dependents while ignoring comments and literals", () => {
    const migrations = [{
      version: "9932",
      filename: "V9932__drop_custom_type.sql",
      sql: "-- DROP TYPE fake CASCADE\nSELECT 'DROP TYPE literal CASCADE'; DROP TYPE IF EXISTS archive.\"custom,type\", public.legacy_type CASCADE; DROP TYPE unused_type RESTRICT;",
    }];

    expect(findFlywayTypeCascadeDropEffects(migrations)).toEqual([{
      version: "9932",
      filename: "V9932__drop_custom_type.sql",
      typeNames: ["custom,type", "legacy_type"],
      ifExists: true,
    }]);
  });

  it("detects DROP DOMAIN CASCADE dependents while excluding RESTRICT", () => {
    const migrations = [{
      version: "9933",
      filename: "V9933__drop_custom_domain.sql",
      sql: "DROP DOMAIN IF EXISTS public.positive_amount, archive.\"legacy,amount\" CASCADE; DROP DOMAIN unused_domain RESTRICT;",
    }];

    expect(findFlywayDomainCascadeDropEffects(migrations)).toEqual([{
      version: "9933",
      filename: "V9933__drop_custom_domain.sql",
      domainNames: ["positive_amount", "legacy,amount"],
      ifExists: true,
    }]);
  });

  it("detects DROP OWNED object removal for all roles and both dependency modes", () => {
    const migrations = [{
      version: "9934",
      filename: "V9934__drop_owned_role_objects.sql",
      sql: "-- DROP OWNED BY commented_role CASCADE\nSELECT 'DROP OWNED BY literal_role CASCADE'; DROP OWNED BY CURRENT_ROLE, \"legacy,role\" CASCADE; DROP OWNED BY old_role RESTRICT;",
    }];

    expect(findFlywayDropOwnedEffects(migrations)).toEqual([
      { version: "9934", filename: "V9934__drop_owned_role_objects.sql", roleNames: ["current_role", "legacy,role"], cascade: true },
      { version: "9934", filename: "V9934__drop_owned_role_objects.sql", roleNames: ["old_role"], cascade: false },
    ]);
  });

  it("sorts versioned SQL migrations numerically and ignores repeatable or non-migration files", () => {
    expect(parseFlywayMigrationFiles([
      "V117__covering_indexes.sql",
      "R__views.sql",
      "V9__initial.sql",
      "README.md",
      "V117.2__followup.sql",
    ]).map(({ version }) => version)).toEqual(["9", "117", "117.2"]);
  });

  it("keeps quoted identifier case when parsing index key terms", () => {
    expect(parseFlywayIndexKeyTerms('"Mixed;""Key" DESC')).toEqual([
      { column: 'Mixed;"Key', direction: "DESC", nulls: "FIRST" },
    ]);
  });

  it("tracks NULLS NOT DISTINCT on unique index source definitions", () => {
    const effects = parseFlywayDdlEffects({
      version: "9925",
      filename: "V9925__unique_index_nulls_not_distinct.sql",
      sql: 'CREATE UNIQUE INDEX account_identity_idx ON accounts (tenant_id, account_id) INCLUDE (display_name) NULLS NOT DISTINCT; CREATE UNIQUE INDEX default_identity_idx ON accounts (tenant_id, account_id); CREATE INDEX partial_cover_idx ON accounts (tenant_id) INCLUDE (display_name) WHERE retired_at IS NULL; CREATE INDEX quoted_include_idx ON accounts (tenant_id) INCLUDE ("WHERE"); CREATE INDEX only_partitioned_idx ON ONLY partitioned_rows (tenant_id); CREATE INDEX custom_storage_idx ON accounts (tenant_id) WITH (fillfactor=70); CREATE INDEX custom_tablespace_idx ON accounts (tenant_id) TABLESPACE fastspace;',
    }).filter(({ kind }) => kind === "index");

    expect(effects).toMatchObject([
      { name: "account_identity_idx", indexUnique: true, indexNullsNotDistinct: true, indexIncludeColumns: ["display_name"], indexHasPredicate: false },
      { name: "default_identity_idx", indexUnique: true, indexIncludeColumns: [], indexHasPredicate: false },
      { name: "partial_cover_idx", indexIncludeColumns: ["display_name"], indexHasPredicate: true, indexPredicateExpression: "retired_at IS NULL" },
      { name: "quoted_include_idx", indexIncludeColumns: ["WHERE"], indexHasPredicate: false },
      { name: "only_partitioned_idx", tableName: "partitioned_rows", indexColumns: ["tenant_id"], indexOnly: true },
      { name: "custom_storage_idx", indexUnverifiedOptions: ["storage_parameters"] },
      { name: "custom_tablespace_idx", indexUnverifiedOptions: ["tablespace"] },
    ]);
    const unnamedEffect = parseFlywayDdlEffects({ version: "1", filename: "V1__unnamed_index.sql", sql: "CREATE INDEX ON unnamed_target (tenant_id);" })[0];
    expect(unnamedEffect).toMatchObject({ kind: "index", indexNameGenerated: true, tableName: "unnamed_target", indexColumns: ["tenant_id"] });
    const literalPredicate = parseFlywayDdlEffects({ version: "2", filename: "V2__predicate_index.sql", sql: "CREATE INDEX active_rows_idx ON accounts (tenant_id) WHERE status = 'active WHERE archived';" })[0];
    expect(literalPredicate).toMatchObject({ indexHasPredicate: true, indexPredicateExpression: "status = 'active WHERE archived'" });
    expect(effects[1]).not.toHaveProperty("indexNullsNotDistinct");
  });

  it("finds top-level index predicates without matching quoted INCLUDE identifiers", () => {
    expect(hasTopLevelSqlKeyword('(tenant_id) INCLUDE (display_name) WHERE retired_at IS NULL', "WHERE")).toBe(true);
    expect(hasTopLevelSqlKeyword('(tenant_id) INCLUDE ("WHERE")', "WHERE")).toBe(false);
  });

  it("compares source and catalog unique-index NULL treatment", () => {
    const base = {
      keyTerms: [{ column: "tenant_id", direction: "ASC" as const, nulls: "LAST" as const }],
      includeColumns: ["payload"],
      unverifiedOptions: [],
      predicateExpression: null,
      unique: true,
      method: "btree",
      hasPredicate: false,
      isValid: true,
      isReady: true,
      isLive: true,
    };
    expect(isFlywayIndexDefinitionVerified({ ...base, nullsNotDistinct: true }, { ...base, nullsNotDistinct: true })).toBe(true);
    expect(isFlywayIndexDefinitionVerified({ ...base, nullsNotDistinct: true }, { ...base, nullsNotDistinct: true, includeColumns: ["other_payload"] })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, nullsNotDistinct: false }, { ...base, nullsNotDistinct: true })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, nullsNotDistinct: false }, { ...base, nullsNotDistinct: false })).toBe(true);
    expect(isFlywayIndexDefinitionVerified({ ...base, nullsNotDistinct: true }, { ...base, nullsNotDistinct: true, hasPredicate: true })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, hasPredicate: true, predicateExpression: "retired_at IS NULL" }, { ...base, hasPredicate: true, predicateExpression: "(retired_at IS NULL)" })).toBe(true);
    expect(isFlywayIndexDefinitionVerified({ ...base, hasPredicate: true, predicateExpression: "retired_at IS NULL" }, { ...base, hasPredicate: true, predicateExpression: "retired_at IS NOT NULL" })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, hasPredicate: true, predicateExpression: "status = 'active'" }, { ...base, hasPredicate: true, predicateExpression: "status = 'inactive'" })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, hasPredicate: true, predicateExpression: "status = E'active'" }, { ...base, hasPredicate: true, predicateExpression: "status = E'active'" })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, hasPredicate: true, predicateExpression: "path = 'a\\\\b'" }, { ...base, hasPredicate: true, predicateExpression: "path = 'a\\\\b'" })).toBe(false);
    expect(isFlywayIndexDefinitionVerified({ ...base, unverifiedOptions: ["tablespace"] }, { ...base })).toBe(false);
  });

  it("matches foreign key referenced columns to a unique key independent of index order", () => {
    expect(matchesFlywayForeignKeyTargetKey(["account_id", "region_id"], ["region_id", "account_id"])).toBe(true);
    expect(matchesFlywayForeignKeyTargetKey(["account_id"], ["account_id", "region_id"])).toBe(false);
    expect(matchesFlywayForeignKeyTargetKey(["account_id", "account_id"], ["account_id", "region_id"])).toBe(false);
  });

  it("parses foreign key actions, match mode, deferrability, and selective delete columns", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "999",
      filename: "V999__fk_options.sql",
      sql: `CREATE TABLE child_rows (
        parent_id bigint,
        retained_id bigint,
        created_at timestamptz,
        PRIMARY KEY (parent_id, retained_id) DEFERRABLE INITIALLY DEFERRED,
        UNIQUE NULLS NOT DISTINCT (retained_id, parent_id) INCLUDE (created_at) DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT child_parent_fk FOREIGN KEY (parent_id, retained_id)
          REFERENCES parent_rows (id, retained_id)
          MATCH FULL ON DELETE SET NULL (parent_id) ON UPDATE CASCADE
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE default_fk (parent_id bigint REFERENCES parent_rows(id));`,
    });

    expect(parsed[0].references).toEqual([{
      localColumns: ["parent_id", "retained_id"],
      targetSchema: null,
      targetTable: "parent_rows",
      targetColumns: ["id", "retained_id"],
      constraintName: "child_parent_fk",
      matchType: "FULL",
      onDelete: "SET NULL",
      onDeleteColumns: ["parent_id"],
      onUpdate: "CASCADE",
      deferrable: true,
      initiallyDeferred: true,
    }]);
    expect(parsed[0].uniqueKeys).toEqual([
      { columns: ["parent_id", "retained_id"], primary: true, deferrable: true, initiallyDeferred: true, nullsNotDistinct: false, includeColumns: [] },
      { columns: ["retained_id", "parent_id"], primary: false, deferrable: true, initiallyDeferred: false, nullsNotDistinct: true, includeColumns: ["created_at"] },
    ]);
    expect(parsed[1].references[0]).toMatchObject({
      matchType: "SIMPLE",
      onDelete: "NO ACTION",
      onDeleteColumns: null,
      onUpdate: "NO ACTION",
      deferrable: false,
      initiallyDeferred: false,
    });
  });

  it("preserves declared key and foreign key constraint names in CREATE TABLE source", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "999",
      filename: "V999__named_fk.sql",
      sql: `CREATE TABLE parent_rows (id bigint, CONSTRAINT parent_rows_pk PRIMARY KEY (id));
        CREATE TABLE child_rows (parent_id bigint, CONSTRAINT child_parent_fk FOREIGN KEY (parent_id) REFERENCES parent_rows (id));`,
    });

    expect(parsed[0].uniqueKeys[0].constraintName).toBe("parent_rows_pk");
    expect(parsed[1].references[0].constraintName).toBe("child_parent_fk");
  });

  it("parses inline check constraints and normalizes syntax without changing literal contents", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "999",
      filename: "V999__check_constraints.sql",
      sql: `CREATE TABLE checks (
        status TEXT CHECK (status IN ('OPEN', 'In Progress')),
        value INTEGER,
        "close)" INTEGER,
        "CHECK (literal)" INTEGER DEFAULT 'CHECK (ignored)' CONSTRAINT positive_value CHECK (value > 0) NO INHERIT CHECK (value < 100),
        CONSTRAINT value_nonnegative CHECK (value >= 0 AND value <= 10),
        CONSTRAINT quoted_identifier_paren CHECK ("close)" > 0),
        CHECK (status <> 'closed   now'),
        CONSTRAINT inherited_check CHECK (value >= 0) NO INHERIT,
        CONSTRAINT room_overlap EXCLUDE USING gist (value WITH =)
      );`,
    });

    expect(parsed[0].checks).toEqual([
      { expression: "status in('OPEN','In Progress')", name: null, noInherit: false },
      { expression: "value>0", name: "positive_value", noInherit: true },
      { expression: "value<100", name: null, noInherit: false },
      { expression: "value>=0 and value<=10", name: "value_nonnegative", noInherit: false },
      { expression: '"close)">0', name: "quoted_identifier_paren", noInherit: false },
      { expression: "status<>'closed   now'", name: null, noInherit: false },
      { expression: "value>=0", name: "inherited_check", noInherit: true },
    ]);
    expect(parsed[0].unsupportedConstraints).toEqual([{ name: "room_overlap", kind: "exclude" }]);
    expect(normalizeFlywayCheckExpression("status IN ('open')"))
      .not.toBe(normalizeFlywayCheckExpression("status IN ('OPEN')"));
    expect(normalizeFlywayCheckExpression("value + +1"))
      .not.toBe(normalizeFlywayCheckExpression("value ++1"));
    expect(normalizeFlywayCheckExpression("value > = 1"))
      .not.toBe(normalizeFlywayCheckExpression("value >= 1"));
    expect(normalizeFlywayCheckExpression('"close)" > 0'))
      .toBe(normalizeFlywayCheckExpression('("close)" > 0)'));
    expect(extractFlywayCheckExpression('CHECK ("close)" > 0)')).toBe('"close)" > 0');
    expect(extractFlywayCheckExpression("CHECK (status = E'closed\\' now')")).toBe("status = E'closed\\' now'");
    expect(compareFlywayCheckExpressions("market IN ('KR', 'US')", "market = ANY (ARRAY['KR'::text, 'US'::text])"))
      .toBe("unverified");
    expect(compareFlywayCheckExpressions("market_cap > 0", "market_cap > (0)::double precision"))
      .toBe("unverified");
    expect(compareFlywayCheckExpressions("value >= 0", "(value >= 0)"))
      .toBe("match");
    expect(compareFlywayCheckExpressions("value >= 0", "value > 0"))
      .toBe("mismatch");
  });

  it("records CREATE TABLE LIKE source and copied options instead of returning an empty shape silently", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "998",
      filename: "V998__like_table.sql",
      sql: "CREATE TABLE IF NOT EXISTS copy_target (LIKE source_table INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);",
    });

    expect(parsed[0]).toMatchObject({
      tableName: "copy_target",
      columns: [],
      likeSource: {
        tableName: "source_table",
        options: ["INCLUDING DEFAULTS", "INCLUDING GENERATED", "INCLUDING IDENTITY", "INCLUDING STORAGE"],
      },
    });
  });

  it("preserves PostgreSQL quoted identifier case and escaped quotes in table definitions", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "992",
      filename: "V992__quoted_identifiers.sql",
      sql: 'CREATE TABLE "Mixed.Schema" ("Mixed;Col" bigint, "Second" bigint, UNIQUE ("Mixed;Col", "Second"), CONSTRAINT "Check;""Name" CHECK ("Mixed;Col" > 0));',
    });
    expect(parsed[0]).toMatchObject({
      tableName: "Mixed.Schema",
      columns: ["Mixed;Col", "Second"],
      uniqueKeys: [{ columns: ["Mixed;Col", "Second"], primary: false }],
      checks: [{ name: 'Check;"Name', expression: '"Mixed;Col">0' }],
    });
  });

  it("parses quoted parentheses and commas inside constraint and inheritance identifiers", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "990",
      filename: "V990__quoted_constraint_identifiers.sql",
      sql: 'CREATE TABLE child_rows ("Local(Part)" text, "Second" text, UNIQUE ("Local(Part)", "Second"), CONSTRAINT fk_rows FOREIGN KEY ("Local(Part)") REFERENCES "Parent(Table)" ("Key,Part"));',
    });
    expect(parsed[0]).toMatchObject({
      uniqueKeys: [{ columns: ["Local(Part)", "Second"], primary: false }],
      references: [{ localColumns: ["Local(Part)"], targetTable: "Parent(Table)", targetColumns: ["Key,Part"] }],
    });
    expect(parseFlywayCreateTableSpecialDefinitions({
      version: "989",
      filename: "V989__quoted_inheritance.sql",
      sql: 'CREATE TABLE inherited_rows (id bigint) INHERITS ("Parent(One,Two)", parent_two);',
    })[0]).toMatchObject({ feature: "INHERITS", options: ["Parent(One,Two)", "parent_two"] });
  });

  it("masks escape strings containing quote, comma, parenthesis, and statement delimiters before clause parsing", () => {
    const migration = {
      version: "988",
      filename: "V988__escape_string_lexing.sql",
      sql: "CREATE TABLE escape_text (value text DEFAULT E'comma, " + String.fromCharCode(92) + "' ) ; UNIQUE (fake', UNIQUE (value)); CREATE TABLE after_escape (id bigint);",
    };
    expect(parseFlywayCreateTableColumns(migration)[0].uniqueKeys).toEqual([
      { columns: ["value"], primary: false, deferrable: false, initiallyDeferred: false, nullsNotDistinct: false, includeColumns: [] },
    ]);
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "relation").map(({ name }) => name))
      .toEqual(["escape_text", "after_escape"]);
  });

  it("detects CREATE TABLE AS, typed tables, and partitions whose shape is not compared", () => {
    const migration = {
      version: "997",
      filename: "V997__derived_tables.sql",
      sql: `CREATE TEMP TABLE scratch AS SELECT id FROM source_rows;
        CREATE TABLE typed OF public.row_type;
        CREATE TABLE child PARTITION OF parent FOR VALUES IN (1);
        CREATE TABLE partitioned (id bigint) PARTITION BY RANGE (id);
        CREATE TABLE inherited (id bigint) INHERITS (parent_a, parent_b);
        SELECT id INTO TEMP TABLE selected_rows FROM source_rows;
        SELECT id FROM source_rows;
        SELECT 'SELECT 9 INTO fake_target'::text AS note FROM source_rows;
        -- SELECT id INTO comment_target FROM source_rows;
        CREATE TABLE ordinary (id bigint);`,
    };
    expect(parseFlywayCreateTableSpecialDefinitions(migration)).toEqual([
      { tableName: "scratch", feature: "AS_QUERY", sourceTable: null, options: [] },
      { tableName: "typed", feature: "TYPED_TABLE", sourceTable: "row_type", options: [] },
      { tableName: "child", feature: "PARTITION_OF", sourceTable: "parent", options: [] },
      { tableName: "partitioned", feature: "PARTITIONED_TABLE", sourceTable: null, options: ["RANGE"] },
      { tableName: "inherited", feature: "INHERITS", sourceTable: "parent_a,parent_b", options: ["parent_a", "parent_b"] },
      { tableName: "selected_rows", feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "relation").map(({ name }) => name))
      .toEqual(["scratch", "typed", "child", "partitioned", "inherited", "selected_rows", "ordinary"]);
  });

  it("limits SELECT INTO detection to individual SQL statements", () => {
    const migration = {
      version: "996",
      filename: "V996__select_into_scope.sql",
      sql: "SELECT 1 AS value; SELECT value INTO TABLE created_rows FROM source_rows; SELECT valueINTO false_target FROM source_rows; SELECT 3 AS value;",
    };
    expect(parseFlywayCreateTableSpecialDefinitions(migration)).toEqual([
      { tableName: "created_rows", feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "relation").map(({ name }) => name)).toEqual(["created_rows"]);
    const cteMigration = {
      version: "995",
      filename: "V995__select_into_cte.sql",
      sql: "WITH source_rows AS (SELECT id FROM instruments) SELECT id INTO TEMP TABLE cte_copy FROM source_rows UNION SELECT id FROM archive_rows;",
    };
    expect(parseFlywayCreateTableSpecialDefinitions(cteMigration)).toEqual([
      { tableName: "cte_copy", feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
    const dollarQuotedMigration = {
      version: "994",
      filename: "V994__select_into_dollar_quote.sql",
      sql: "DO $migration$ BEGIN PERFORM 'SELECT 1 INTO fake_target;'; END $migration$; SELECT id INTO actual_target FROM source_rows;",
    };
    expect(parseFlywayCreateTableSpecialDefinitions(dollarQuotedMigration)).toEqual([
      { tableName: "actual_target", feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
    const quotedIdentifierMigration = {
      version: "993",
      filename: "V993__select_into_quoted_identifier.sql",
      sql: 'SELECT id INTO "schema;part"."Created;""Rows""" FROM source_rows; SELECT 1;',
    };
    expect(parseFlywayCreateTableSpecialDefinitions(quotedIdentifierMigration)).toEqual([
      { tableName: 'Created;"Rows"', feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
    expect(parseFlywayDdlEffects(quotedIdentifierMigration).filter(({ kind }) => kind === "relation").map(({ name }) => name))
      .toEqual(['Created;"Rows"']);
  });

  it("reports source migrations missing from successful Flyway history and failed history rows", () => {
    const report = auditFlywayHistory(
      [{ version: "84", success: true }, { version: "85", success: false }],
      [{ version: "84", filename: "V84__last_applied.sql" }, { version: "85", filename: "V85__split.sql" }, { version: "137", filename: "V137__latest.sql" }],
    );
    expect(report).toMatchObject({ appliedLatest: "84", sourceLatest: "137", appliedMigrationCount: 1, sourceMigrationCount: 3, drift: true });
    expect(report.pending.map(({ version }) => version)).toEqual(["85", "137"]);
    expect(report.failed.map(({ version }) => version)).toEqual(["85"]);
  });

  it("reports no drift when every source migration is successfully applied", () => {
    expect(auditFlywayHistory(
      [{ version: "1", success: true }, { version: "2", success: true }],
      [{ version: "1", filename: "V1__one.sql" }, { version: "2", filename: "V2__two.sql" }],
    ).drift).toBe(false);
  });

  it("blocks split-migration preflight when source tables are absent, views, or destinations already exist", () => {
    const report = auditUniverseSplitPreconditions([
      { tableName: "kr_instrument_universe", relationKind: "v", estimatedRows: null },
      { tableName: "kr_instrument_universe_candles", relationKind: "r", estimatedRows: 1200 },
      { tableName: "kr_common_stock_universe", relationKind: "r", estimatedRows: 20 },
      { tableName: "us_instrument_universe", relationKind: "r", estimatedRows: 500 },
      { tableName: "us_instrument_universe_candles", relationKind: "r", estimatedRows: 9000 },
      { tableName: "us_instrument_universe_legacy", relationKind: "r", estimatedRows: 1 },
    ]);
    expect(report[0]).toMatchObject({ structuralPreconditionsPass: false, source: { physicalTable: false }, destinations: [{ exists: true }, { exists: false }] });
    expect(report[1]).toMatchObject({ structuralPreconditionsPass: false, renameTarget: { exists: true } });
    expect(report[0].destructiveOperations).toContain("DROP source universe table");
  });

  it("reports structural-only preconditions without claiming migration safety", () => {
    const report = auditUniverseSplitPreconditions([
      { tableName: "kr_instrument_universe", relationKind: "r", estimatedRows: 2300 },
      { tableName: "kr_instrument_universe_candles", relationKind: "r", estimatedRows: 98000 },
      { tableName: "us_instrument_universe", relationKind: "r", estimatedRows: 5400 },
      { tableName: "us_instrument_universe_candles", relationKind: "r", estimatedRows: 620000 },
    ]);
    expect(report.every((market) => market.structuralPreconditionsPass)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("safeToApply");
    expect(report[0].destructiveOperations).toHaveLength(2);
    expect(report[1].destructiveOperations).toContain("RENAME source universe table to legacy");
  });

  it("distinguishes an observed post-migration relation shape from executable preconditions", () => {
    const report = auditUniverseSplitPreconditions([
      { tableName: "kr_instrument_universe", relationKind: "v", estimatedRows: null },
      { tableName: "kr_instrument_universe_candles", relationKind: "r", estimatedRows: 98000 },
      { tableName: "kr_common_stock_universe", relationKind: "r", estimatedRows: 2300 },
      { tableName: "kr_special_instrument_universe", relationKind: "r", estimatedRows: 640 },
      { tableName: "us_instrument_universe", relationKind: "v", estimatedRows: null },
      { tableName: "us_instrument_universe_candles", relationKind: "r", estimatedRows: 620000 },
      { tableName: "us_common_stock_universe", relationKind: "r", estimatedRows: 5400 },
      { tableName: "us_special_instrument_universe", relationKind: "r", estimatedRows: 1900 },
      { tableName: "us_instrument_universe_legacy", relationKind: "r", estimatedRows: 5300 },
    ]);
    expect(report.map(({ postMigrationShapePresent, structuralPreconditionsPass }) => ({ postMigrationShapePresent, structuralPreconditionsPass }))).toEqual([
      { postMigrationShapePresent: true, structuralPreconditionsPass: false },
      { postMigrationShapePresent: true, structuralPreconditionsPass: false },
    ]);
    expect(report[0].postMigrationShapeNote).toContain("does not verify migration history");
  });

  it("extracts multiple columns from one ALTER TABLE and records data mutations separately", () => {
    const migration = {
      version: "92",
      filename: "V92__quotes.sql",
      sql: "ALTER TABLE public.quotes ADD COLUMN price NUMERIC, ADD COLUMN amount NUMERIC; UPDATE quotes SET amount = 1;",
    };
    expect(parseFlywayDdlEffects(migration).filter((effect) => effect.kind === "column").map((effect) => effect.name)).toEqual(["price", "amount"]);
    const audit = auditFlywayDdlInventory([migration], {
      relations: [{ name: "quotes", kind: "r" }],
      columns: [{ tableName: "quotes", columnName: "price" }],
      constraints: [],
    });
    expect(audit.mismatchCount).toBe(1);
    expect(audit.mismatches[0]).toMatchObject({ kind: "column", name: "amount", matches: false });
    expect(audit.unverifiedDataOperationCount).toBe(1);
    expect(audit.dataOperationsByMigration[0].operations).toEqual([{ operation: "UPDATE", tableName: "quotes" }]);
  });

  it("preserves mixed-case quoted relation and comma-containing column names through DDL inventory", () => {
    const migration = {
      version: "991",
      filename: "V991__quoted_alter_names.sql",
      sql: 'CREATE TABLE "Mixed;Table" ("Mixed,Column" text); ALTER TABLE "Mixed;Table" ADD COLUMN "Other;Column" text, ADD COLUMN "Last,Column" text; ALTER TABLE second_table ADD COLUMN after_escape integer;',
    };
    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "relation", name: "Mixed;Table" },
      { kind: "column", tableName: "Mixed;Table", name: "Other;Column" },
      { kind: "column", tableName: "Mixed;Table", name: "Last,Column" },
      { kind: "column", tableName: "second_table", name: "after_escape" },
    ]);
    expect(auditFlywayDdlInventory([migration], {
      relations: [{ name: "Mixed;Table", kind: "r" }, { name: "second_table", kind: "r" }],
      columns: [
        { tableName: "Mixed;Table", columnName: "Other;Column" },
        { tableName: "Mixed;Table", columnName: "Last,Column" },
        { tableName: "second_table", columnName: "after_escape" },
      ],
      constraints: [],
    }).mismatches).toEqual([]);
  });

  it("ignores semicolons and DDL-like text inside comments and dollar-quoted bodies", () => {
    const migration = {
      version: "992",
      filename: "V992__quoted_body_boundaries.sql",
      sql: `DO $마이그레이션_본문$ BEGIN
        PERFORM 1;
        ALTER TABLE dollar_target ADD COLUMN ghost integer;
      END $마이그레이션_본문$;
      /* nested comment: /* ; ALTER TABLE nested_target ADD COLUMN ghost integer; */ still comment */
      -- ; ALTER TABLE line_target ADD COLUMN ghost integer;
      ALTER TABLE real_target ADD COLUMN actual integer;`,
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "column")).toMatchObject([
      { kind: "column", tableName: "real_target", name: "actual" },
    ]);
  });

  it("parses Unicode unquoted PostgreSQL table and column identifiers", () => {
    const migration = {
      version: "9911",
      filename: "V9911__unicode_identifiers.sql",
      sql: "한글CREATE TABLE 가짜표 (id integer); SELECT이름 INTO 가짜결과 FROM 원본; CREATE TABLE 한글표 (이름 text); ALTER TABLE 한글표 ADD COLUMN 시가총액 bigint; CREATE VIEW 한글뷰 AS SELECT 이름 FROM 한글표; DROP TABLE 임시표; CREATE INDEX 한글인덱스 ON 한글표 (시가총액); CREATE SEQUENCE 번호순번; ALTER TABLE 한글표 RENAME TO 새한글표; UPDATE 새한글표 SET 시가총액 = 1; SELECT 이름 INTO 한글복사 FROM 새한글표;",
    };

    expect(parseFlywayCreateTableColumns(migration).map(({ tableName, columns }) => ({ tableName, columns }))).toEqual([
      { tableName: "한글표", columns: ["이름"] },
    ]);
    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "relation", name: "한글표" },
      { kind: "column", tableName: "한글표", name: "시가총액" },
      { kind: "relation", name: "한글뷰", relationType: "view" },
      { kind: "relation", name: "임시표", operation: "absent" },
      { kind: "index", name: "한글인덱스", tableName: "한글표", indexColumns: ["시가총액"] },
      { kind: "sequence", name: "번호순번" },
      { kind: "relation", name: "한글표", operation: "absent" },
      { kind: "relation", name: "새한글표", operation: "present" },
      { kind: "relation", name: "한글복사", operation: "present" },
    ]);
    expect(auditFlywayDdlInventory([migration], { relations: [], columns: [], constraints: [] }).dataOperationsByMigration[0].operations)
      .toEqual([{ operation: "UPDATE", tableName: "새한글표" }]);
  });

  it("does not split Unicode identifiers at ASCII keyword boundaries", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "9912",
      filename: "V9912__unicode_keyword_boundaries.sql",
      sql: "CREATE TABLE 토큰경계 (한글UNIQUE integer, 한글REFERENCES integer, 𐐀UNIQUE integer);",
    });

    expect(parsed[0].columns).toEqual(["한글unique", "한글references", "𐐀UNIQUE".toLowerCase()]);
    expect(parsed[0].uniqueKeys).toEqual([]);
    expect(parsed[0].references).toEqual([]);
  });

  it("checks supplementary Unicode code points when finding SQL keyword boundaries", () => {
    const migration = {
      version: "9913",
      filename: "V9913__supplementary_identifier_boundary.sql",
      sql: "𐐀SELECT INTO false_target FROM source_rows; SELECT id INTO real_target FROM source_rows;",
    };

    expect(parseFlywayCreateTableSpecialDefinitions(migration)).toEqual([
      { tableName: "real_target", feature: "SELECT_INTO", sourceTable: null, options: [] },
    ]);
  });

  it("does not read a Unicode referenced column suffix as a deferrability clause", () => {
    const parsed = parseFlywayCreateTableColumns({
      version: "9914",
      filename: "V9914__unicode_fk_keyword_suffix.sql",
      sql: "CREATE TABLE child_rows (parent_id bigint REFERENCES parent_rows (한글DEFERRABLE));",
    });

    expect(parsed[0].references).toEqual([{
      localColumns: ["parent_id"],
      targetSchema: null,
      targetTable: "parent_rows",
      targetColumns: ["한글deferrable"],
      matchType: "SIMPLE",
      onDelete: "NO ACTION",
      onDeleteColumns: null,
      onUpdate: "NO ACTION",
      deferrable: false,
      initiallyDeferred: false,
    }]);
  });

  it("parses qualified identifiers with whitespace around schema dots", () => {
    const migration = {
      version: "9915",
      filename: "V9915__spaced_qualified_identifiers.sql",
      sql: 'CREATE TABLE public . "Mixed.Schema" (id bigint); ALTER TABLE public . "Mixed.Schema" ADD COLUMN label text; CREATE INDEX spaced_idx ON public . "Mixed.Schema" (id); CREATE TABLE child_rows (parent_id bigint REFERENCES public . parent_rows(id)); CREATE TABLE public . " Name With Space " (id bigint);',
    };

    expect(parseFlywayCreateTableColumns(migration).map(({ tableName }) => tableName)).toEqual(["Mixed.Schema", "child_rows", " Name With Space "]);
    expect(parseFlywayCreateTableColumns(migration)[1].references[0]).toMatchObject({ targetSchema: "public", targetTable: "parent_rows" });
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => ["relation", "column", "index"].includes(kind))).toMatchObject([
      { kind: "relation", name: "Mixed.Schema" },
      { kind: "column", tableName: "Mixed.Schema", name: "label" },
      { kind: "index", name: "spaced_idx", tableName: "Mixed.Schema", indexColumns: ["id"] },
      { kind: "relation", name: "child_rows" },
      { kind: "relation", name: " Name With Space " },
    ]);
  });

  it("decodes PostgreSQL Unicode-escaped quoted identifiers for DDL and index keys", () => {
    const migration = {
      version: "9916",
      filename: "V9916__unicode_escaped_identifiers.sql",
      sql: String.raw`CREATE TABLE U&"d\0061ta" (U&"c\006fl" text); CREATE INDEX escaped_idx ON U&"d\0061ta" (U&"c\006fl"); CREATE TABLE U&"n!0061me" UESCAPE '!' (id bigint); CREATE TABLE "U&""d\0061ta""" (id bigint); CREATE TABLE U&"\+01F600" (id bigint); CREATE TABLE U&"\D83D\DE00" (id bigint); CREATE TABLE U&"parent" (U&"id" bigint); CREATE TABLE child_rows (U&"parent\005fid" bigint, CONSTRAINT U&"fk\005fchild" FOREIGN KEY (U&"parent\005fid") REFERENCES U&"parent" (U&"id")); CREATE TABLE checks (id bigint, CONSTRAINT U&"ck\005fpositive" CHECK (id > 0)); CREATE SEQUENCE U&"seq\005fmain"; ALTER TABLE U&"data" RENAME TO U&"renamed\005ftable";`,
    };

    expect(parseFlywayCreateTableColumns(migration).map(({ tableName, columns }) => ({ tableName, columns }))).toEqual([
      { tableName: "data", columns: ["col"] },
      { tableName: "name", columns: ["id"] },
      { tableName: String.raw`U&"d\0061ta"`, columns: ["id"] },
      { tableName: "😀", columns: ["id"] },
      { tableName: "😀", columns: ["id"] },
      { tableName: "parent", columns: ["id"] },
      { tableName: "child_rows", columns: ["parent_id"] },
      { tableName: "checks", columns: ["id"] },
    ]);
    const parsedTables = parseFlywayCreateTableColumns(migration);
    expect(parsedTables[7].checks).toEqual([{ expression: "id>0", name: "ck_positive", noInherit: false }]);
    expect(parsedTables[6].references).toMatchObject([{
      localColumns: ["parent_id"],
      targetTable: "parent",
      targetColumns: ["id"],
    }]);
    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "relation", name: "data" },
      { kind: "index", name: "escaped_idx", tableName: "data", indexColumns: ["col"] },
      { kind: "relation", name: "name" },
      { kind: "relation", name: String.raw`U&"d\0061ta"` },
      { kind: "relation", name: "😀" },
      { kind: "relation", name: "😀" },
      { kind: "relation", name: "parent" },
      { kind: "relation", name: "child_rows" },
      { kind: "relation", name: "checks" },
      { kind: "sequence", name: "seq_main" },
      { kind: "relation", name: "data", operation: "absent" },
      { kind: "relation", name: "renamed_table", operation: "present" },
    ]);
  });

  it("masks ordinary literals preceded by a UESCAPE type name", () => {
    const migration = {
      version: "9917",
      filename: "V9917__uescape_type_literal.sql",
      sql: "SELECT UESCAPE 'x; CREATE TABLE false_target (id integer);'; CREATE TABLE actual_target (id integer);",
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "relation").map(({ name }) => name))
      .toEqual(["actual_target"]);
  });

  it("tracks both names in ALTER TABLE RENAME COLUMN", () => {
    const migration = {
      version: "9918",
      filename: "V9918__rename_column_inventory.sql",
      sql: String.raw`ALTER TABLE public . source_rows RENAME COLUMN U&"old\005fname" TO U&"new\005fname"; ALTER TABLE IF EXISTS ONLY public.source_rows RENAME new_name TO final_name; ALTER TABLE source_rows RENAME CONSTRAINT U&"old\005fconstraint" TO U&"new\005fconstraint";`,
    };

    expect(parseFlywayDdlEffects(migration)).toEqual([
      { kind: "column", operation: "absent", name: "old_name", tableName: "source_rows", tableSchemaName: "public", statementStart: 0, version: "9918", filename: "V9918__rename_column_inventory.sql" },
      { kind: "column", operation: "present", name: "new_name", tableName: "source_rows", tableSchemaName: "public", statementStart: 0, version: "9918", filename: "V9918__rename_column_inventory.sql" },
      { kind: "column", operation: "absent", name: "new_name", tableName: "source_rows", tableSchemaName: "public", tableIfExists: true, statementStart: 84, version: "9918", filename: "V9918__rename_column_inventory.sql" },
      { kind: "column", operation: "present", name: "final_name", tableName: "source_rows", tableSchemaName: "public", tableIfExists: true, statementStart: 84, version: "9918", filename: "V9918__rename_column_inventory.sql" },
      { kind: "constraint", operation: "absent", name: "old_constraint", tableName: "source_rows", renamedToConstraint: "new_constraint", statementStart: 161, version: "9918", filename: "V9918__rename_column_inventory.sql" },
      { kind: "constraint", operation: "present", name: "new_constraint", tableName: "source_rows", renamedFromConstraint: "old_constraint", statementStart: 161, version: "9918", filename: "V9918__rename_column_inventory.sql" },
    ]);
    expect(auditFlywayDdlInventory([migration], {
      relations: [{ name: "source_rows", kind: "r" }],
      columns: [{ tableName: "source_rows", columnName: "final_name" }],
      constraints: [{ tableName: "source_rows", name: "new_constraint" }],
    }).mismatches).toEqual([]);
  });

  it("treats ALTER TABLE IF EXISTS against an absent table as a conditional no-op", () => {
    const migration = {
      version: "9919",
      filename: "V9919__conditional_alter_absent_table.sql",
      sql: "ALTER TABLE IF EXISTS missing_rows ADD COLUMN value integer; ALTER TABLE IF EXISTS missing_rows RENAME CONSTRAINT old_ck TO new_ck;",
    };

    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "column", operation: "present", name: "value", tableName: "missing_rows", tableIfExists: true },
      { kind: "constraint", operation: "absent", name: "old_ck", tableName: "missing_rows", tableIfExists: true },
      { kind: "constraint", operation: "present", name: "new_ck", tableName: "missing_rows", tableIfExists: true },
    ]);
    const audit = auditFlywayDdlInventory([migration], { relations: [], columns: [], constraints: [] });
    expect(audit.mismatches).toEqual([]);
    expect(audit.skippedParentAbsentObjectCount).toBe(3);
  });

  it("records columns referenced by ALTER COLUMN actions without simulating definition changes", () => {
    const migration = {
      version: "9921",
      filename: "V9921__alter_column_presence.sql",
      sql: "ALTER TABLE IF EXISTS setting_rows ALTER COLUMN \"displayName\" SET DEFAULT 'N/A', ALTER amount TYPE bigint USING amount::bigint, ALTER COLUMN archived DROP NOT NULL, ALTER COLUMN identity_id RESTART WITH 1, ALTER CONSTRAINT uq_setting_rows DEFERRABLE, VALIDATE CONSTRAINT fk_setting_rows;",
    };

    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "column", operation: "present", name: "displayName", tableName: "setting_rows", requiresExistingColumn: true, tableIfExists: true },
      { kind: "column", operation: "present", name: "amount", tableName: "setting_rows", requiresExistingColumn: true, tableIfExists: true },
      { kind: "column", operation: "present", name: "archived", tableName: "setting_rows", requiresExistingColumn: true, tableIfExists: true },
      { kind: "column", operation: "present", name: "identity_id", tableName: "setting_rows", requiresExistingColumn: true, tableIfExists: true },
      { kind: "constraint", operation: "present", name: "uq_setting_rows", tableName: "setting_rows", requiresExistingConstraint: true, tableIfExists: true },
      { kind: "constraint", operation: "present", name: "fk_setting_rows", tableName: "setting_rows", requiresExistingConstraint: true, tableIfExists: true },
    ]);
    const audit = auditFlywayDdlInventory([migration], {
      relations: [{ name: "setting_rows", kind: "r" }],
      columns: [
        { tableName: "setting_rows", columnName: "displayName" },
        { tableName: "setting_rows", columnName: "amount" },
        { tableName: "setting_rows", columnName: "archived" },
        { tableName: "setting_rows", columnName: "identity_id" },
      ],
      constraints: [
        { tableName: "setting_rows", name: "uq_setting_rows" },
        { tableName: "setting_rows", name: "fk_setting_rows" },
      ],
    });
    expect(audit.mismatches).toEqual([]);
  });

  it("carries named CREATE TABLE constraints into later ALTER constraint checks", () => {
    const migration = {
      version: "9922",
      filename: "V9922__create_then_validate_constraint.sql",
      sql: "CREATE TABLE fresh_rows (id integer, CONSTRAINT fresh_rows_positive CHECK (id > 0)); ALTER TABLE fresh_rows VALIDATE CONSTRAINT fresh_rows_positive;",
    };

    expect(parseFlywayCreateTableColumns(migration)[0].namedConstraints).toEqual(["fresh_rows_positive"]);
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint")).toMatchObject([{
      kind: "constraint",
      operation: "present",
      name: "fresh_rows_positive",
      tableName: "fresh_rows",
      requiresExistingConstraint: true,
    }]);
  });

  it("extracts quoted local and referenced columns from ALTER TABLE foreign keys", () => {
    const migration = {
      version: "9923",
      filename: "V9923__alter_foreign_key_target.sql",
      sql: 'ALTER TABLE child_rows ADD CONSTRAINT fk_child_parent FOREIGN KEY ("local,(id)", parent_id) REFERENCES public . parent_rows ("key,part", id);',
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint")).toMatchObject([{
      name: "fk_child_parent",
      tableName: "child_rows",
      foreignKeyTarget: {
        localColumns: ["local,(id)", "parent_id"],
        targetSchema: "public",
        targetTable: "parent_rows",
        targetColumns: ["key,part", "id"],
      },
    }]);
  });

  it("preserves non-public foreign-key target schemas for fail-closed auditing", () => {
    const migration = {
      version: "9924",
      filename: "V9924__other_schema_foreign_key.sql",
      sql: "ALTER TABLE child_rows ADD CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES archive.parent_rows (id);",
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint")).toMatchObject([{
      foreignKeyTarget: { targetSchema: "archive", targetTable: "parent_rows", targetColumns: ["id"] },
    }]);
    expect(parseFlywayCreateTableColumns({
      ...migration,
      sql: "CREATE TABLE child_rows (parent_id bigint REFERENCES archive.parent_rows (id));",
    })[0].references).toMatchObject([{ targetSchema: "archive", targetTable: "parent_rows", targetColumns: ["id"] }]);
  });

  it("does not treat ALTER keywords inside quoted identifiers or nested CHECK expressions as actions", () => {
    const migration = {
      version: "9926",
      filename: "V9926__alter_check_keyword_boundaries.sql",
      sql: `ALTER TABLE check_rows ADD CONSTRAINT valid_check CHECK ("ADD CONSTRAINT ghost" = 'ADD CONSTRAINT phantom'), ADD CONSTRAINT second_check CHECK (true);`,
    };

    const constraints = parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint");
    expect(constraints).toMatchObject([
      { kind: "constraint", operation: "present", name: "valid_check", tableName: "check_rows" },
      { kind: "constraint", operation: "present", name: "second_check", tableName: "check_rows" },
    ]);
    expect(parseFlywayDdlEffects(migration).filter(({ name }) => name === "ghost" || name === "phantom")).toEqual([]);
  });

  it("preserves conditional DROP CONSTRAINT semantics alongside conditional table existence", () => {
    const migration = {
      version: "9927",
      filename: "V9927__conditional_constraint_drop.sql",
      sql: "ALTER TABLE IF EXISTS audit_rows DROP CONSTRAINT IF EXISTS legacy_check;",
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint")).toMatchObject([{
      kind: "constraint",
      operation: "absent",
      name: "legacy_check",
      tableName: "audit_rows",
      ifExists: true,
      tableIfExists: true,
    }]);
  });

  it("reports index targets dropped earlier in versioned source history", () => {
    const migrations = [
      { version: "167", filename: "V167__retention_index.sql", sql: "CREATE INDEX retired_rows_idx ON retired_rows (created_at);" },
      { version: "70", filename: "V70__remove_retired_rows.sql", sql: "DROP TABLE IF EXISTS retired_rows CASCADE;" },
      { version: "7", filename: "V7__create_retired_rows.sql", sql: "CREATE TABLE retired_rows (created_at timestamptz);" },
    ];

    expect(auditFlywayIndexTargetsAgainstSourceHistory(migrations)).toEqual([{
      version: "167",
      filename: "V167__retention_index.sql",
      indexName: "retired_rows_idx",
      targetTable: "retired_rows",
      droppedInVersion: "70",
      droppedInFilename: "V70__remove_retired_rows.sql",
    }]);
  });

  it("tracks every target in a comma-separated DROP TABLE statement", () => {
    const migrations = [
      { version: "167", filename: "V167__retention_index.sql", sql: 'CREATE INDEX first_retired_idx ON "retired,rows" (created_at); CREATE INDEX second_retired_idx ON second_retired_rows (created_at);' },
      { version: "70", filename: "V70__remove_retired_rows.sql", sql: 'DROP TABLE IF EXISTS "retired,rows", second_retired_rows CASCADE;' },
    ];

    expect(auditFlywayIndexTargetsAgainstSourceHistory(migrations)).toMatchObject([
      { indexName: "first_retired_idx", targetTable: "retired,rows", droppedInVersion: "70" },
      { indexName: "second_retired_idx", targetTable: "second_retired_rows", droppedInVersion: "70" },
    ]);
    expect(parseFlywayDdlEffects(migrations[1]).filter(({ kind }) => kind === "relation").every(({ dropCascade }) => dropCascade)).toBe(true);
  });

  it("tracks materialized-view creation, removal, and index targets", () => {
    const migrations = [
      { version: "167", filename: "V167__refreshable_summary_index.sql", sql: "CREATE MATERIALIZED VIEW public.daily_summary AS SELECT 1 AS total; CREATE INDEX daily_summary_total_idx ON public.daily_summary (total);" },
      { version: "132", filename: "V132__remove_old_summary.sql", sql: "DROP MATERIALIZED VIEW IF EXISTS public.daily_summary, public.weekly_summary CASCADE;" },
    ];
    const effects = parseFlywayDdlEffects(migrations[0]);

    expect(effects.filter(({ kind }) => kind === "relation")).toMatchObject([
      { operation: "present", name: "daily_summary", relationType: "materialized_view", schemaName: "public" },
    ]);
    expect(effects.filter(({ kind }) => kind === "index")).toMatchObject([
      { name: "daily_summary_total_idx", tableName: "daily_summary", tableSchemaName: "public" },
    ]);
    expect(parseFlywayDdlEffects(migrations[1]).filter(({ kind }) => kind === "relation")).toMatchObject([
      { operation: "absent", name: "daily_summary", relationType: "materialized_view", schemaName: "public", dropCascade: true },
      { operation: "absent", name: "weekly_summary", relationType: "materialized_view", schemaName: "public", dropCascade: true },
    ]);
    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "daily_summary", "168")).toMatchObject({
      version: "167",
      relationType: "materialized_view",
    });
  });

  it("tracks table moves across the public schema boundary without assuming an optional source exists", () => {
    const publicToArchive = {
      version: "9929",
      filename: "V9929__move_table_out_of_public.sql",
      sql: "ALTER TABLE IF EXISTS public.moved_rows SET SCHEMA archive;",
    };
    const archiveToPublic = {
      version: "9930",
      filename: "V9930__move_table_to_public.sql",
      sql: "ALTER TABLE archive.returned_rows SET SCHEMA public;",
    };
    const optionalArchiveToPublic = {
      version: "9931",
      filename: "V9931__move_optional_table_to_public.sql",
      sql: "ALTER TABLE IF EXISTS archive.optional_rows SET SCHEMA public;",
    };

    expect(parseFlywayDdlEffects(publicToArchive)).toMatchObject([{
      kind: "relation",
      operation: "absent",
      name: "moved_rows",
      schemaName: "public",
      movedToSchema: "archive",
      ifExists: true,
    }]);
    expect(auditFlywayIndexTargetsAgainstSourceHistory([
      { version: "9932", filename: "V9932__moved_rows_index.sql", sql: "CREATE INDEX moved_rows_idx ON public.moved_rows (id);" },
      { version: "9929", filename: "V9929__move_table_out_of_public.sql", sql: publicToArchive.sql },
      { version: "1", filename: "V1__create_moved_rows.sql", sql: "CREATE TABLE public.moved_rows (id bigint);" },
    ])).toMatchObject([{ indexName: "moved_rows_idx", droppedInVersion: "9929" }]);
    expect(findFlywayRelationCreationSourceBeforeVersion([
      { version: "9932", filename: "V9932__later_index.sql", sql: "CREATE INDEX returned_rows_idx ON public.returned_rows (id);" },
      { version: "9930", filename: "V9930__move_table_to_public.sql", sql: archiveToPublic.sql },
    ], "returned_rows", "9932")).toMatchObject({ version: "9930", relationType: "table" });
    expect(findFlywayRelationCreationSourceBeforeVersion([
      { version: "9932", filename: "V9932__later_index.sql", sql: "CREATE INDEX optional_rows_idx ON public.optional_rows (id);" },
      { version: "9931", filename: "V9931__move_optional_table_to_public.sql", sql: optionalArchiveToPublic.sql },
    ], "optional_rows", "9932")).toBeNull();
  });

  it("does not report an index target recreated after its earlier drop", () => {
    const migrations = [
      { version: "167", filename: "V167__retention_index.sql", sql: "CREATE INDEX current_rows_idx ON current_rows (created_at);" },
      { version: "70", filename: "V70__remove_current_rows.sql", sql: "DROP TABLE IF EXISTS current_rows CASCADE;" },
      { version: "71", filename: "V71__restore_current_rows.sql", sql: "CREATE TABLE current_rows (created_at timestamptz);" },
    ];

    expect(auditFlywayIndexTargetsAgainstSourceHistory(migrations)).toEqual([]);
  });

  it("finds the last source migration that creates a relation before a pending index", () => {
    const migrations = [
      { version: "167", filename: "V167__retention_index.sql", sql: "CREATE INDEX event_run_finished_idx ON event_runs (finished_at);" },
      { version: "132", filename: "V132__event_runs.sql", sql: "CREATE TABLE event_runs (finished_at timestamptz);" },
      { version: "140", filename: "V140__retire_old_event_runs.sql", sql: "DROP TABLE IF EXISTS event_runs;" },
      { version: "145", filename: "V145__restore_event_runs.sql", sql: "CREATE TABLE event_runs (finished_at timestamptz);" },
    ];

    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "event_runs", "167")).toEqual({
      version: "145",
      filename: "V145__restore_event_runs.sql",
      relationType: "table",
    });
    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "event_runs", "140")).toEqual({
      version: "132",
      filename: "V132__event_runs.sql",
      relationType: "table",
    });
  });

  it("classifies a missing index target creator as older-unapplied when its history row is absent", () => {
    const creator = { version: "132", filename: "V132__event_runs.sql" };
    const laterIndex = { version: "167", filename: "V167__event_runs_index.sql" };
    const olderUnapplied = [creator];
    const pending = [laterIndex];

    expect(classifyFlywayMigrationState("132", [], pending, olderUnapplied)).toBe("OLDER_UNAPPLIED");
    expect(classifyFlywayMigrationState("167", [], pending, olderUnapplied)).toBe("PENDING");
    expect(classifyFlywayMigrationState("132", [{ version: "132", success: true }], pending, olderUnapplied)).toBe("APPLIED");
  });

  it("keeps non-public schema relations out of the public index-target history", () => {
    const migrations = [
      { version: "167", filename: "V167__public_retention_index.sql", sql: "CREATE INDEX public_event_rows_idx ON public.event_rows (created_at);" },
      { version: "70", filename: "V70__drop_archive_rows.sql", sql: "DROP TABLE IF EXISTS archive.event_rows CASCADE;" },
      { version: "132", filename: "V132__archive_rows.sql", sql: "CREATE TABLE archive.event_rows (created_at timestamptz);" },
    ];

    expect(auditFlywayIndexTargetsAgainstSourceHistory(migrations)).toEqual([]);
    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "event_rows", "167")).toBeNull();
  });

  it("tracks the V89 physical table rename and compatibility view as separate creators", () => {
    const migrations = ["V89__split_us_instrument_universe.sql", "V65__instrument_universe_tables.sql"].map((filename) => ({
      version: filename.match(/^V(\d+)/)![1],
      filename,
      sql: readFileSync(join(process.cwd(), "db/migration", filename), "utf8"),
    }));

    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "us_instrument_universe_legacy", "90")).toMatchObject({
      version: "89",
      filename: "V89__split_us_instrument_universe.sql",
      relationType: "table",
    });
    expect(findFlywayRelationCreationSourceBeforeVersion(migrations, "us_instrument_universe", "90")).toMatchObject({
      version: "89",
      filename: "V89__split_us_instrument_universe.sql",
      relationType: "view",
    });
  });

  it("preserves explicit non-public index target schemas for scoped auditing", () => {
    const migration = {
      version: "9928",
      filename: "V9928__archive_index.sql",
      sql: "CREATE INDEX archive_event_rows_idx ON archive.event_rows (created_at);",
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "index")).toMatchObject([{
      kind: "index",
      name: "archive_event_rows_idx",
      tableName: "event_rows",
      tableSchemaName: "archive",
    }]);
  });

  it("preserves explicit non-public schemas on ALTER TABLE effects", () => {
    const migration = {
      version: "9929",
      filename: "V9929__archive_table_column.sql",
      sql: "ALTER TABLE archive.event_rows ADD COLUMN archived_at timestamptz; ALTER TABLE archive.event_rows ADD CONSTRAINT event_rows_archived_at_nn CHECK (archived_at IS NOT NULL);",
    };

    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "column" || kind === "constraint")).toMatchObject([
      { kind: "column", operation: "present", name: "archived_at", tableName: "event_rows", tableSchemaName: "archive" },
      { kind: "constraint", operation: "present", name: "event_rows_archived_at_nn", tableName: "event_rows", tableSchemaName: "archive" },
    ]);
  });

  it("isolates DROP COLUMN and DROP CONSTRAINT CASCADE to their ALTER actions", () => {
    const migration = {
      version: "9935",
      filename: "V9935__alter_drop_dependencies.sql",
      sql: "ALTER TABLE public.event_rows DROP COLUMN first_col, DROP COLUMN second_col CASCADE, DROP CONSTRAINT event_rows_fk CASCADE, DROP CONSTRAINT event_rows_check;",
    };

    const absentEffects = parseFlywayDdlEffects(migration).filter(({ operation }) => operation === "absent");
    expect(absentEffects.map(({ statementStart }) => statementStart)).toEqual([0, 0, 0, 0]);
    expect(absentEffects).toMatchObject([
      { kind: "column", name: "first_col", dropColumn: true },
      { kind: "column", name: "second_col", dropColumn: true, dropCascade: true },
      { kind: "constraint", name: "event_rows_fk", dropCascade: true },
      { kind: "constraint", name: "event_rows_check" },
    ]);
  });

  it("parses ALTER TABLE ADD UNIQUE and PRIMARY KEY definitions for source-order FK checks", () => {
    const migration = {
      version: "9936",
      filename: "V9936__add_parent_unique_keys.sql",
      sql: "ALTER TABLE parent_rows ADD CONSTRAINT parent_rows_code_key UNIQUE NULLS NOT DISTINCT (tenant_id, code) INCLUDE (created_at) DEFERRABLE INITIALLY DEFERRED, ADD CONSTRAINT parent_rows_id_key PRIMARY KEY (id); ALTER TABLE parent_rows ADD CONSTRAINT parent_rows_code_pattern UNIQUE (code text_pattern_ops);",
    };

    const constraints = parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "constraint");
    expect(constraints).toMatchObject([
      {
        kind: "constraint",
        name: "parent_rows_code_key",
        uniqueKey: {
          columns: ["tenant_id", "code"],
          primary: false,
          deferrable: true,
          initiallyDeferred: true,
          nullsNotDistinct: true,
          includeColumns: ["created_at"],
        },
      },
      {
        kind: "constraint",
        name: "parent_rows_id_key",
        uniqueKey: { columns: ["id"], primary: true, deferrable: false },
      },
      { kind: "constraint", name: "parent_rows_code_pattern", uniqueKeyUnverified: true },
    ]);
    expect(matchesFlywayForeignKeyTargetKey(["id"], constraints[1].uniqueKey!.columns)).toBe(true);
    expect(constraints[2]).toMatchObject({ name: "parent_rows_code_pattern", uniqueKeyUnverified: true });
  });

  it("detects anonymous and USING INDEX unique constraints without confusing them for columns", () => {
    const migration = {
      version: "9937",
      filename: "V9937__unmodeled_alter_unique_keys.sql",
      sql: "-- ALTER TABLE ignored_rows ADD UNIQUE (commented_col)\nSELECT 'ALTER TABLE ignored_rows ADD UNIQUE (literal_col)'; ALTER TABLE audit_rows ADD UNIQUE (email), ADD PRIMARY KEY (id); ALTER TABLE audit_rows ADD CONSTRAINT audit_rows_email_key UNIQUE USING INDEX audit_rows_email_idx; ALTER TABLE audit_rows ADD CONSTRAINT named_email_key UNIQUE (email);",
    };

    expect(findFlywayUnmodeledAlterUniqueKeyEffects([migration])).toEqual([
      { version: "9937", filename: "V9937__unmodeled_alter_unique_keys.sql", tableName: "audit_rows", form: "anonymous_constraint", constraintName: null, indexName: null },
      { version: "9937", filename: "V9937__unmodeled_alter_unique_keys.sql", tableName: "audit_rows", form: "anonymous_constraint", constraintName: null, indexName: null },
      { version: "9937", filename: "V9937__unmodeled_alter_unique_keys.sql", tableName: "audit_rows", form: "using_index", constraintName: "audit_rows_email_key", indexName: "audit_rows_email_idx" },
    ]);
    expect(parseFlywayDdlEffects(migration).filter(({ kind }) => kind === "column")).toEqual([]);
  });

  it("treats conditional table renames as no-ops only when both names are absent", () => {
    const migration = {
      version: "9920",
      filename: "V9920__conditional_table_rename.sql",
      sql: "ALTER TABLE IF EXISTS old_rows RENAME TO new_rows;",
    };

    expect(parseFlywayDdlEffects(migration)).toMatchObject([
      { kind: "relation", operation: "absent", name: "old_rows", ifExists: true, renamedToRelation: "new_rows" },
      { kind: "relation", operation: "present", name: "new_rows", conditionalSourceRelation: "old_rows", renamedFromRelation: "old_rows" },
    ]);
    const noOpAudit = auditFlywayDdlInventory([migration], { relations: [], columns: [], constraints: [] });
    expect(noOpAudit.mismatches).toEqual([]);
    const unappliedAudit = auditFlywayDdlInventory([migration], {
      relations: [{ name: "old_rows", kind: "r" }],
      columns: [],
      constraints: [],
    });
    expect(unappliedAudit.mismatches).toMatchObject([
      { kind: "relation", name: "old_rows", expectedPresent: false, actualPresent: true },
      { kind: "relation", name: "new_rows", expectedPresent: true, actualPresent: false },
    ]);
  });

  it("keeps V140 limited to one additive RSS candidate column with no data mutation", () => {
    const migration = {
      version: "140",
      filename: "V140__market_rss_translation_candidate_title.sql",
      sql: readFileSync(join(process.cwd(), "db/migration/V140__market_rss_translation_candidate_title.sql"), "utf8"),
    };

    expect(parseFlywayDdlEffects(migration)).toEqual([{
      kind: "column",
      operation: "present",
      name: "translation_candidate_title",
      tableName: "market_rss_articles",
      statementStart: 0,
      ifExists: false,
      ifNotExists: false,
      version: "140",
      filename: "V140__market_rss_translation_candidate_title.sql",
    }]);
    const audit = auditFlywayDdlInventory([migration], { relations: [], columns: [], constraints: [] });
    expect(audit.unverifiedDataOperationCount).toBe(0);
    expect(audit.mismatches).toHaveLength(1);
    expect(audit.mismatches[0]).toMatchObject({ kind: "column", tableName: "market_rss_articles", name: "translation_candidate_title", expectedPresent: true, actualPresent: false });
  });

  it("compares final migration-declared relation state instead of intermediate operations", () => {
    const audit = auditFlywayDdlInventory([
      { version: "85", filename: "V85__drop.sql", sql: "DROP TABLE legacy;" },
      { version: "89", filename: "V89__view.sql", sql: "CREATE VIEW legacy AS SELECT 1;" },
    ], {
      relations: [{ name: "legacy", kind: "v" }],
      columns: [],
      constraints: [],
    });
    expect(audit.mismatchCount).toBe(0);
    expect(audit.checkedObjectCount).toBe(1);
  });
});
