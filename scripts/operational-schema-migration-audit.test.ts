import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findMissingOperationalRelations, parseOperationalSchemaTables } from "./operational-schema-migration-audit.mjs";

const root = process.cwd();

describe("operational schema migration audit", () => {
  const schemaSource = readFileSync(join(root, "lib", "schema-health.ts"), "utf8");
  const migrationDirectory = join(root, "db", "migration");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => /^V\d+__.+\.sql$/.test(name))
    .map((fileName) => ({ fileName, contents: readFileSync(join(migrationDirectory, fileName), "utf8") }));

  it("requires every operational health table to have a creation migration", () => {
    expect(parseOperationalSchemaTables(schemaSource)).toHaveLength(13);
    expect(findMissingOperationalRelations(schemaSource, migrations)).toEqual([]);
  });

  it("reports an operational table when its creation migration is missing", () => {
    const schemaWithUnmigratedTable = schemaSource.replace('"debug_run_items"', '"migration_missing_regression_fixture"');
    expect(findMissingOperationalRelations(schemaWithUnmigratedTable, migrations)).toContain("migration_missing_regression_fixture");
  });

  it("recognizes quoted and schema-qualified CREATE TABLE statements", () => {
    const schema = 'export const OPERATIONAL_SCHEMA_TABLES = ["quoted_fixture"] as const;';
    expect(findMissingOperationalRelations(schema, [{ fileName: "V1__fixture.sql", contents: 'CREATE TABLE IF NOT EXISTS public."quoted_fixture" (id BIGINT);' }])).toEqual([]);
  });

  it("detects a table dropped by a later migration unless replaced by a view", () => {
    const schema = 'export const OPERATIONAL_SCHEMA_TABLES = ["compat_fixture", "retired_fixture"] as const;';
    const fixtureMigrations = [
      { fileName: "V1__create.sql", contents: "CREATE TABLE compat_fixture (id BIGINT); CREATE TABLE retired_fixture (id BIGINT);" },
      { fileName: "V2__replace.sql", contents: "DROP TABLE compat_fixture; CREATE VIEW compat_fixture AS SELECT 1 AS id; DROP TABLE retired_fixture;" },
    ];
    expect(findMissingOperationalRelations(schema, fixtureMigrations)).toEqual(["retired_fixture"]);
  });

  it("tracks a table rename as removal of the old name and creation of the new name", () => {
    const schema = 'export const OPERATIONAL_SCHEMA_TABLES = ["old_fixture", "new_fixture"] as const;';
    expect(findMissingOperationalRelations(schema, [{
      fileName: "V1__rename.sql",
      contents: "CREATE TABLE old_fixture (id BIGINT); ALTER TABLE old_fixture RENAME TO new_fixture;",
    }])).toEqual(["old_fixture"]);
  });
});
