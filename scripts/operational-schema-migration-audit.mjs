export function parseOperationalSchemaTables(source) {
  return parseOperationalSchemaRelations(source, "OPERATIONAL_SCHEMA_TABLES");
}

export function parseOperationalSchemaViews(source) {
  if (!/export const OPERATIONAL_SCHEMA_VIEWS\s*=/.test(source)) return [];
  return parseOperationalSchemaRelations(source, "OPERATIONAL_SCHEMA_VIEWS");
}

export function parseForwardOperationalTables(source) {
  return parseOperationalSchemaRelations(source, "FORWARD_REQUIRED_OPERATIONAL_TABLES");
}

function parseOperationalSchemaRelations(source, relationListName) {
  const arrays = new Map(
    [...source.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s*as const/g)]
      .map((match) => [match[1], match[2]]),
  );
  if (!arrays.has(relationListName)) throw new Error(`${relationListName} was not found.`);

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

  return expand(relationListName);
}

export function findMissingOperationalColumnTables(schemaSource) {
  const requiredTables = [...new Set(parseRequiredOperationalColumns(schemaSource).map(([table]) => table))];
  const operationalTables = new Set(parseOperationalSchemaTables(schemaSource));
  return requiredTables.filter((table) => !operationalTables.has(table));
}

function parseRequiredOperationalColumns(schemaSource, name = "REQUIRED_OPERATIONAL_COLUMNS") {
  const arrays = new Map(
    [...schemaSource.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s*as const/g)]
      .map((match) => [match[1], match[2]]),
  );
  function expand(arrayName, stack = []) {
    if (stack.includes(arrayName)) throw new Error(`Circular required-column array reference: ${[...stack, arrayName].join(" -> ")}`);
    const body = arrays.get(arrayName);
    if (body === undefined) throw new Error(`${arrayName} was not found.`);
    const pairs = [];
    let remainder = body;
    for (const match of body.matchAll(/\.\.\.\s*([A-Z][A-Z0-9_]*)|\[\s*["']([a-z_][a-z0-9_]*)["']\s*,\s*["']([a-z_][a-z0-9_]*)["']\s*\]/gi)) {
      pairs.push(...(match[1]
        ? expand(match[1], [...stack, arrayName])
        : [[match[2].toLowerCase(), match[3].toLowerCase()]]));
      remainder = remainder.replace(match[0], " ");
    }
    if (remainder.replace(/[\s,]/g, "")) throw new Error(`Unsupported entry in ${arrayName}: ${remainder.trim()}`);
    return pairs;
  }
  const pairs = expand(name);
  if (pairs.length === 0) throw new Error(`${name} must contain at least one required column.`);
  return pairs;
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
  const expectedRelations = [
    ...parseOperationalSchemaTables(schemaSource).map((name) => ({ name, kind: "TABLE" })),
    ...parseOperationalSchemaViews(schemaSource).map((name) => ({ name, kind: "VIEW" })),
  ];
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
  return expectedRelations.filter(({ name, kind }) => {
    if (externallyManagedRelations.has(name)) return false;
    const state = relationStates.get(name);
    return !state?.exists || (state.kind !== kind && !(kind === "TABLE" && state.kind === "TABLE (RENAMED)"));
  }).map(({ name }) => name);
}

export function findMissingForwardOperationalColumns(schemaSource, migrations, minimumVersion) {
  const requiredColumns = parseRequiredOperationalColumns(schemaSource, "FORWARD_REQUIRED_OPERATIONAL_COLUMNS")
    .map(([table, column]) => `${table}.${column}`);
  const alterTablePattern = new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${sqlIdentifier})\\b`, "i");
  const addColumnPattern = /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[a-z_][a-z0-9_$]*"?)\b/gi;
  const addedColumns = new Set();
  const reservedTableElementNames = new Set(["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "EXCLUDE"]);
  const splitTopLevelSqlList = (sql) => {
    const parts = [];
    let depth = 0;
    let quote = null;
    let dollarQuote = null;
    let start = 0;
    for (let index = 0; index < sql.length; index += 1) {
      const character = sql[index];
      if (dollarQuote) {
        if (sql.startsWith(dollarQuote, index)) {
          index += dollarQuote.length - 1;
          dollarQuote = null;
        }
        continue;
      }
      if (quote) {
        if (character === quote && sql[index + 1] === quote) {
          index += 1;
          continue;
        }
        if (character === quote) quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
        continue;
      }
      if (character === "$") {
        const tag = sql.slice(index).match(/^\$[a-z_0-9]*\$/i)?.[0];
        if (tag) {
          dollarQuote = tag;
          index += tag.length - 1;
          continue;
        }
      }
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (character === "," && depth === 0) {
        parts.push(sql.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(sql.slice(start));
    return parts;
  };
  for (const migration of migrations) {
    const version = Number(migration.fileName.match(/^V(\d+)/)?.[1] ?? 0);
    if (version < minimumVersion) continue;
    const withoutComments = migration.contents.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
    for (const statement of withoutComments.split(";")) {
      const createTable = statement.match(new RegExp(`^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${sqlIdentifier})\\s*\\(([\\s\\S]*)\\)\\s*$`, "i"));
      if (createTable) {
        const table = normalizeIdentifier(createTable[1]);
        for (const element of splitTopLevelSqlList(createTable[2])) {
          const columnName = element.trim().match(/^"?([a-z_][a-z0-9_$]*)"?\s+/i)?.[1];
          if (columnName && !reservedTableElementNames.has(columnName.toUpperCase())) {
            addedColumns.add(`${table}.${normalizeIdentifier(columnName)}`);
          }
        }
      }
      const table = statement.match(alterTablePattern)?.[1];
      if (!table) continue;
      for (const match of statement.matchAll(addColumnPattern)) {
        addedColumns.add(`${normalizeIdentifier(table)}.${normalizeIdentifier(match[1])}`);
      }
    }
  }
  return requiredColumns.filter((column) => !addedColumns.has(column));
}

export function findMissingForwardOperationalTables(schemaSource, migrations, minimumVersion) {
  const requiredTables = parseForwardOperationalTables(schemaSource);
  const relationStates = new Map();
  const orderedMigrations = [...migrations]
    .filter((migration) => Number(migration.fileName.match(/^V(\d+)/)?.[1] ?? 0) >= minimumVersion)
    .sort((left, right) => Number(left.fileName.match(/^V(\d+)/)?.[1] ?? 0) - Number(right.fileName.match(/^V(\d+)/)?.[1] ?? 0));
  for (const migration of orderedMigrations) {
    for (const event of listRelationEvents(migration.contents)) {
      if (event.action === "create") relationStates.set(event.name, { exists: true, kind: event.kind });
      else if (event.action === "drop") relationStates.set(event.name, { exists: false, kind: null });
      else {
        relationStates.set(event.name, { exists: false, kind: null });
        relationStates.set(event.newName, { exists: true, kind: "TABLE (RENAMED)" });
      }
    }
  }
  return requiredTables.filter((table) => {
    const state = relationStates.get(table);
    return !state?.exists || (state.kind !== "TABLE" && state.kind !== "TABLE (RENAMED)");
  });
}

export function findMissingForwardOperationalIndexes(schemaSource, migrations, minimumVersion) {
  const block = schemaSource.match(/export const FORWARD_REQUIRED_OPERATIONAL_INDEXES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error("FORWARD_REQUIRED_OPERATIONAL_INDEXES was not found.");
  const required = [];
  let remainder = block[1];
  for (const match of block[1].matchAll(/\[\s*["']([a-z_][a-z0-9_]*)["']\s*,\s*["']([a-z_][a-z0-9_]*)["']\s*,\s*["']([^"']+)["']\s*\]/gi)) {
    required.push({ name: match[1].toLowerCase(), table: match[2].toLowerCase(), columns: match[3].replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase() });
    remainder = remainder.replace(match[0], " ");
  }
  if (required.length === 0 || remainder.replace(/[\s,]/g, "")) throw new Error(`Unsupported entry in FORWARD_REQUIRED_OPERATIONAL_INDEXES: ${remainder.trim()}`);

  const indexStates = new Map();
  const orderedMigrations = [...migrations]
    .filter((migration) => Number(migration.fileName.match(/^V(\d+)/)?.[1] ?? 0) >= minimumVersion)
    .sort((left, right) => Number(left.fileName.match(/^V(\d+)/)?.[1] ?? 0) - Number(right.fileName.match(/^V(\d+)/)?.[1] ?? 0));
  const identifier = '(?:"?[a-z_][a-z0-9_$]*"?\\s*\\.\\s*)?"?[a-z_][a-z0-9_$]*"?';
  for (const migration of orderedMigrations) {
    const sql = migration.contents.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
    for (const statement of sql.split(";")) {
      const create = statement.match(new RegExp(`^\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(${identifier})\\s+ON\\s+(${identifier})\\s*\\(([^)]*)\\)`, "i"));
      if (create) {
        const name = normalizeIdentifier(create[1]);
        indexStates.set(name, {
          name,
          table: normalizeIdentifier(create[2]),
          columns: create[3].replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase(),
        });
        continue;
      }
      const drop = statement.match(new RegExp(`^\\s*DROP\\s+INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+EXISTS)?\\s+(${identifier})`, "i"));
      if (drop) indexStates.delete(normalizeIdentifier(drop[1]));
    }
  }
  return required.filter((index) => {
    const actual = indexStates.get(index.name);
    return !actual || actual.table !== index.table || actual.columns !== index.columns;
  }).map(({ name }) => name);
}
