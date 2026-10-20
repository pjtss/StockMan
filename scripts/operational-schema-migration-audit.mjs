export function parseOperationalSchemaTables(source) {
  const arrays = new Map(
    [...source.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s*as const/g)]
      .map((match) => [match[1], match[2]]),
  );
  if (!arrays.has("OPERATIONAL_SCHEMA_TABLES")) throw new Error("OPERATIONAL_SCHEMA_TABLES was not found.");

  function expand(name, stack = []) {
    if (stack.includes(name)) throw new Error(`Circular schema table array reference: ${[...stack, name].join(" -> ")}`);
    const body = arrays.get(name);
    if (body === undefined) throw new Error(`Unknown schema table array reference: ${name}`);
    const tables = [];
    let remainder = body;
    for (const match of body.matchAll(/\.\.\.\s*([A-Z][A-Z0-9_]*)|["']([a-z][a-z0-9_]*)["']/g)) {
      tables.push(...(match[1] ? expand(match[1], [...stack, name]) : [match[2]]));
      remainder = remainder.replace(match[0], " ");
    }
    if (remainder.replace(/[\s,]/g, "")) throw new Error(`Unsupported entry in ${name}: ${remainder.trim()}`);
    return tables;
  }

  return expand("OPERATIONAL_SCHEMA_TABLES");
}

function normalizeIdentifier(identifier) {
  return identifier
    .split(".")
    .at(-1)
    .replaceAll('"', "")
    .toLowerCase();
}

const sqlIdentifier = '(?:"?[a-z_][a-z0-9_$]*"?\\s*\\.\\s*)?"?[a-z_][a-z0-9_$]*"?';

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

// Flyway creates and owns its schema-history table; application migrations must not create it.
const externallyManagedRelations = new Set(["flyway_schema_history"]);

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
  return tables.filter((table) => !externallyManagedRelations.has(table) && !relationStates.get(table)?.exists);
}

export function findMissingForwardOperationalColumns(schemaSource, migrations, minimumVersion) {
  const block = schemaSource.match(/export const FORWARD_REQUIRED_OPERATIONAL_COLUMNS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error("FORWARD_REQUIRED_OPERATIONAL_COLUMNS was not found.");
  const requiredColumns = [...block[1].matchAll(/\[\s*["']([a-z_][a-z0-9_$]*)["']\s*,\s*["']([a-z_][a-z0-9_$]*)["']\s*\]/gi)]
    .map((match) => `${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
  const addColumnPattern = new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${sqlIdentifier})\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?("?[a-z_][a-z0-9_$]*"?)\\b`, "i");
  const addedColumns = new Set();
  for (const migration of migrations) {
    const version = Number(migration.fileName.match(/^V(\d+)/)?.[1] ?? 0);
    if (version < minimumVersion) continue;
    const withoutComments = migration.contents.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
    for (const statement of withoutComments.split(";")) {
      const match = statement.match(addColumnPattern);
      if (match) addedColumns.add(`${normalizeIdentifier(match[1])}.${normalizeIdentifier(match[2])}`);
    }
  }
  return requiredColumns.filter((column) => !addedColumns.has(column));
}
