import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditFlywayDdlInventory, auditFlywayHistory, auditUniverseSplitPreconditions, parseFlywayDdlEffects, parseFlywayMigrationFiles } from "./flyway-history-audit";

describe("flyway-history-audit", () => {
  it("sorts versioned SQL migrations numerically and ignores repeatable or non-migration files", () => {
    expect(parseFlywayMigrationFiles([
      "V117__covering_indexes.sql",
      "R__views.sql",
      "V9__initial.sql",
      "README.md",
      "V117.2__followup.sql",
    ]).map(({ version }) => version)).toEqual(["9", "117", "117.2"]);
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
