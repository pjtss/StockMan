import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findMissingOperationalMigrations, parseOperationalSchemaTables } from "./operational-schema-migration-audit.mjs";

const root = process.cwd();

describe("operational schema migration audit", () => {
  const schemaSource = readFileSync(join(root, "lib", "schema-health.ts"), "utf8");
  const migrationDirectory = join(root, "db", "migration");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => /^V\d+__.+\.sql$/.test(name))
    .map((fileName) => ({ fileName, contents: readFileSync(join(migrationDirectory, fileName), "utf8") }));

  it("requires every operational health table to have a creation migration", () => {
    expect(parseOperationalSchemaTables(schemaSource)).toHaveLength(13);
    expect(findMissingOperationalMigrations(schemaSource, migrations)).toEqual([]);
  });

  it("reports an operational table when its creation migration is missing", () => {
    const schemaWithUnmigratedTable = schemaSource.replace('"debug_run_items"', '"migration_missing_regression_fixture"');
    expect(findMissingOperationalMigrations(schemaWithUnmigratedTable, migrations)).toContain("migration_missing_regression_fixture");
  });

  it("recognizes quoted and schema-qualified CREATE TABLE statements", () => {
    const schema = 'export const OPERATIONAL_SCHEMA_TABLES = ["quoted_fixture"] as const;';
    expect(findMissingOperationalMigrations(schema, [{ fileName: "fixture.sql", contents: 'CREATE TABLE IF NOT EXISTS public."quoted_fixture" (id BIGINT);' }])).toEqual([]);
  });
});
