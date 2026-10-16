export function parseOperationalSchemaTables(source) {
  const block = source.match(/export const OPERATIONAL_SCHEMA_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error("OPERATIONAL_SCHEMA_TABLES was not found.");
  return [...block[1].matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map((match) => match[1]);
}

export function findMissingOperationalMigrations(schemaSource, migrations) {
  const tables = parseOperationalSchemaTables(schemaSource);
  const migrationSql = migrations.map(({ contents }) => contents).join("\n");
  return tables.filter((table) => {
    const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const createTable = new RegExp(
      `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\s*\\.\\s*)?["']?${escapedTable}["']?\\s*(?:\\(|AS\\b)`,
      "i",
    );
    return !createTable.test(migrationSql);
  });
}
