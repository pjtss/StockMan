export function parseOperationalSchemaTables(source) {
  const block = source.match(/export const OPERATIONAL_SCHEMA_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error("OPERATIONAL_SCHEMA_TABLES was not found.");
  return [...block[1].matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map((match) => match[1]);
}

function normalizeIdentifier(identifier) {
  return identifier
    .split(".")
    .at(-1)
    .replaceAll('"', "")
    .toLowerCase();
}

function listRelationEvents(sql) {
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
  const events = [];
  const identifier = '(?:"?[a-z_][a-z0-9_$]*"?\\s*\\.\\s*)?"?[a-z_][a-z0-9_$]*"?';
  for (const statement of withoutComments.split(";")) {
    const create = statement.match(new RegExp(`^\\s*CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(TABLE|VIEW|MATERIALIZED\\s+VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${identifier})\\b`, "i"));
    if (create) {
      events.push({ action: "create", name: normalizeIdentifier(create[2]), kind: create[1].toUpperCase().replace(/\s+/g, " ") });
      continue;
    }
    const drop = statement.match(new RegExp(`^\\s*DROP\\s+(?:TABLE|VIEW|MATERIALIZED\\s+VIEW)\\s+(?:IF\\s+EXISTS\\s+)?(${identifier})\\b`, "i"));
    if (drop) {
      events.push({ action: "drop", name: normalizeIdentifier(drop[1]) });
      continue;
    }
    const rename = statement.match(new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${identifier})\\s+RENAME\\s+TO\\s+("?[a-z_][a-z0-9_$]*"?)\\b`, "i"));
    if (rename) {
      events.push({ action: "rename", name: normalizeIdentifier(rename[1]), newName: normalizeIdentifier(rename[2]) });
    }
  }
  return events;
}

export function findMissingOperationalRelations(schemaSource, migrations) {
  const tables = parseOperationalSchemaTables(schemaSource);
  const relationStates = new Map();
  const orderedMigrations = [...migrations].sort((left, right) => {
    const leftVersion = Number(left.fileName.match(/^V(\d+)/)?.[1] ?? 0);
    const rightVersion = Number(right.fileName.match(/^V(\d+)/)?.[1] ?? 0);
    return leftVersion - rightVersion;
  });
  for (const migration of orderedMigrations) {
    for (const event of listRelationEvents(migration.contents)) {
      if (event.action === "create") relationStates.set(event.name, { exists: true, kind: event.kind, migration: migration.fileName });
      else if (event.action === "drop") relationStates.set(event.name, { exists: false, migration: migration.fileName });
      else {
        relationStates.set(event.name, { exists: false, migration: migration.fileName });
        relationStates.set(event.newName, { exists: true, kind: "TABLE (RENAMED)", migration: migration.fileName });
      }
    }
  }
  return tables.filter((table) => !relationStates.get(table)?.exists);
}
