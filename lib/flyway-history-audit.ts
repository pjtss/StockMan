export type FlywayHistoryRecord = {
  version: string | null;
  success: boolean;
  script?: string | null;
};

export type FlywayMigrationFile = {
  version: string;
  filename: string;
};

export type FlywayRelationState = {
  tableName: string;
  relationKind: string | null;
  estimatedRows: number | null;
};

export type FlywayMigrationSql = FlywayMigrationFile & { sql: string };
export type FlywayCatalogSnapshot = {
  relations: Array<{ name: string; kind: string }>;
  columns: Array<{ tableName: string; columnName: string }>;
  constraints: Array<{ tableName: string; name: string }>;
};

type DdlEffect = {
  kind: "relation" | "column" | "index" | "sequence" | "constraint";
  operation: "present" | "absent";
  name: string;
  tableName?: string;
  relationType?: "table" | "view" | "any";
  version: string;
  filename: string;
};

function cleanIdentifier(identifier: string) {
  return identifier.replaceAll('"', "").split(".").at(-1)!.toLowerCase();
}

export function parseFlywayDdlEffects(migration: FlywayMigrationSql): DdlEffect[] {
  const sql = migration.sql.replace(/--[^\r\n]*/g, " ");
  const effects: DdlEffect[] = [];
  const add = (effect: Omit<DdlEffect, "version" | "filename">) => effects.push({ ...effect, version: migration.version, filename: migration.filename });

  for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[1]), relationType: "table" });
  }
  for (const match of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([\w".]+)/gi)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[1]), relationType: "view" });
  }
  for (const match of sql.matchAll(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)/gi)) {
    add({ kind: "relation", operation: "absent", name: cleanIdentifier(match[1]), relationType: "any" });
  }
  for (const match of sql.matchAll(/\bALTER\s+TABLE\s+(?:ONLY\s+)?([\w".]+)\s+RENAME\s+TO\s+([\w"]+)/gi)) {
    add({ kind: "relation", operation: "absent", name: cleanIdentifier(match[1]), relationType: "any" });
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[2]), relationType: "any" });
  }
  for (const match of sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)\s+ON\s+([\w".]+)/gi)) {
    add({ kind: "index", operation: "present", name: cleanIdentifier(match[1]), tableName: cleanIdentifier(match[2]) });
  }
  for (const match of sql.matchAll(/\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([\w".]+)/gi)) {
    add({ kind: "index", operation: "absent", name: cleanIdentifier(match[1]) });
  }
  for (const match of sql.matchAll(/\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi)) {
    add({ kind: "sequence", operation: "present", name: cleanIdentifier(match[1]) });
  }
  for (const alter of sql.matchAll(/\bALTER\s+TABLE\s+(?:ONLY\s+)?([\w".]+)([^;]*);/gi)) {
    const tableName = cleanIdentifier(alter[1]);
    const body = alter[2];
    for (const match of body.matchAll(/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi)) {
      add({ kind: "column", operation: "present", name: cleanIdentifier(match[1]), tableName });
    }
    for (const match of body.matchAll(/\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([\w"]+)/gi)) {
      add({ kind: "column", operation: "absent", name: cleanIdentifier(match[1]), tableName });
    }
    for (const match of body.matchAll(/\bADD\s+CONSTRAINT\s+([\w"]+)/gi)) {
      add({ kind: "constraint", operation: "present", name: cleanIdentifier(match[1]), tableName });
    }
    for (const match of body.matchAll(/\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([\w"]+)/gi)) {
      add({ kind: "constraint", operation: "absent", name: cleanIdentifier(match[1]), tableName });
    }
  }
  return effects;
}

/**
 * Compares final source-declared object presence with PostgreSQL catalogs.
 * This is a heuristic DDL inventory only; it cannot prove checksums, column
 * definitions, index validity, or data backfill correctness.
 */
export function auditFlywayDdlInventory(migrations: FlywayMigrationSql[], catalog: FlywayCatalogSnapshot) {
  const finalEffects = new Map<string, DdlEffect>();
  const dataOperations: Array<{ version: string; filename: string; operation: string; tableName: string }> = [];

  for (const migration of migrations) {
    for (const effect of parseFlywayDdlEffects(migration)) {
      const key = `${effect.kind}:${effect.tableName ?? ""}:${effect.name}`;
      finalEffects.set(key, effect);
    }
    const uncommentedSql = migration.sql.replace(/--[^\r\n]*/g, " ");
    for (const match of uncommentedSql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+(?:ONLY\s+)?([\w".]+)/gi)) {
      dataOperations.push({ version: migration.version, filename: migration.filename, operation: match[1].replace(/\s+/g, " ").toUpperCase(), tableName: cleanIdentifier(match[2]) });
    }
  }

  const relationMap = new Map(catalog.relations.map((relation) => [relation.name.toLowerCase(), relation.kind]));
  const columnSet = new Set(catalog.columns.map(({ tableName, columnName }) => `${tableName.toLowerCase()}.${columnName.toLowerCase()}`));
  const constraintSet = new Set(catalog.constraints.map(({ tableName, name }) => `${tableName.toLowerCase()}.${name.toLowerCase()}`));
  const objectChecks = [...finalEffects.values()].map((effect) => {
    let actualPresent = false;
    let actualKind: string | null = null;
    if (effect.kind === "relation") {
      actualKind = relationMap.get(effect.name) ?? null;
      actualPresent = actualKind !== null;
      if (actualPresent && effect.relationType === "table") actualPresent = actualKind === "r" || actualKind === "p";
      if (actualPresent && effect.relationType === "view") actualPresent = actualKind === "v" || actualKind === "m";
    } else if (effect.kind === "column") actualPresent = columnSet.has(`${effect.tableName}.${effect.name}`);
    else if (effect.kind === "constraint") actualPresent = constraintSet.has(`${effect.tableName}.${effect.name}`);
    else {
      actualKind = relationMap.get(effect.name) ?? null;
      actualPresent = effect.kind === "index" ? actualKind === "i" || actualKind === "I" : actualKind === "S";
    }
    return {
      kind: effect.kind,
      name: effect.name,
      tableName: effect.tableName ?? null,
      expectedPresent: effect.operation === "present",
      actualPresent,
      actualKind,
      matches: actualPresent === (effect.operation === "present"),
      declaredBy: { version: effect.version, filename: effect.filename },
    };
  });
  const mismatches = objectChecks.filter((check) => !check.matches);
  const dataByMigration = new Map<string, { version: string; filename: string; operations: Array<{ operation: string; tableName: string }> }>();
  for (const operation of dataOperations) {
    const existing = dataByMigration.get(operation.version) ?? { version: operation.version, filename: operation.filename, operations: [] };
    existing.operations.push({ operation: operation.operation, tableName: operation.tableName });
    dataByMigration.set(operation.version, existing);
  }
  return {
    checkedObjectCount: objectChecks.length,
    matchingObjectCount: objectChecks.length - mismatches.length,
    mismatchCount: mismatches.length,
    mismatches,
    unverifiedDataOperationCount: dataOperations.length,
    dataOperationsByMigration: [...dataByMigration.values()],
    note: "Object presence is heuristic only; it does not verify Flyway checksums, full definitions, valid indexes, or data-operation results.",
  };
}

function compareVersion(left: string, right: string) {
  const a = left.split(".").map((part) => Number(part));
  const b = right.split(".").map((part) => Number(part));
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function parseFlywayMigrationFiles(filenames: string[]): FlywayMigrationFile[] {
  return filenames.flatMap((filename) => {
    const match = filename.match(/^V([0-9]+(?:\.[0-9]+)*)__.+\.sql$/i);
    return match ? [{ version: match[1], filename }] : [];
  }).sort((left, right) => compareVersion(left.version, right.version));
}

export function auditFlywayHistory(history: FlywayHistoryRecord[], migrations: FlywayMigrationFile[]) {
  const successfulVersions = new Set(history.filter((row) => row.success && row.version).map((row) => row.version!));
  const pending = migrations.filter((migration) => !successfulVersions.has(migration.version));
  const failed = history.filter((row) => !row.success);
  const appliedVersions = [...successfulVersions].sort(compareVersion);
  const sourceVersions = migrations.map((migration) => migration.version);
  return {
    appliedLatest: appliedVersions.at(-1) ?? null,
    sourceLatest: sourceVersions.at(-1) ?? null,
    appliedMigrationCount: successfulVersions.size,
    sourceMigrationCount: migrations.length,
    pending,
    failed,
    drift: pending.length > 0 || failed.length > 0,
  };
}

/**
 * Checks only structural prerequisites for the two historical universe split
 * migrations. A passing result is not a safety approval: those migrations also
 * copy/filter data and delete or rename legacy relations.
 */
export function auditUniverseSplitPreconditions(relations: FlywayRelationState[]) {
  const byName = new Map(relations.map((relation) => [relation.tableName, relation]));
  const inspectMarket = (market: "kr" | "us") => {
    const sourceName = `${market}_instrument_universe`;
    const candlesName = `${market}_instrument_universe_candles`;
    const commonName = `${market}_common_stock_universe`;
    const specialName = `${market}_special_instrument_universe`;
    const source = byName.get(sourceName);
    const candles = byName.get(candlesName);
    const common = byName.get(commonName);
    const special = byName.get(specialName);
    const legacyRenameTarget = market === "us" ? byName.get("us_instrument_universe_legacy") : null;
    const isPhysicalTable = (relation: FlywayRelationState | undefined) => relation?.relationKind === "r" || relation?.relationKind === "p";

    return {
      market,
      source: { name: sourceName, kind: source?.relationKind ?? null, estimatedRows: source?.estimatedRows ?? null, physicalTable: isPhysicalTable(source) },
      candles: { name: candlesName, kind: candles?.relationKind ?? null, estimatedRows: candles?.estimatedRows ?? null, physicalTable: isPhysicalTable(candles) },
      destinations: [commonName, specialName].map((name) => ({ name, exists: Boolean(byName.get(name)?.relationKind) })),
      ...(market === "us" ? { renameTarget: { name: "us_instrument_universe_legacy", exists: Boolean(legacyRenameTarget?.relationKind) } } : {}),
      structuralPreconditionsPass: isPhysicalTable(source)
        && isPhysicalTable(candles)
        && !common?.relationKind
        && !special?.relationKind
        && (market !== "us" || !legacyRenameTarget?.relationKind),
      destructiveOperations: market === "kr"
        ? ["DELETE candle rows outside filtered common-stock universe", "DROP source universe table"]
        : ["DELETE candle rows outside filtered common-stock universe", "RENAME source universe table to legacy"],
    };
  };

  return [inspectMarket("kr"), inspectMarket("us")];
}
