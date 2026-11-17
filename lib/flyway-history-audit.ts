export type FlywayHistoryRecord = {
  version: string | null;
  success: boolean;
  script?: string | null;
  description?: string | null;
  type?: string | null;
  checksum?: number | null;
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
  schemaName?: string | null;
  tableName?: string;
  tableSchemaName?: string | null;
  ifExists?: boolean;
  ifNotExists?: boolean;
  tableIfExists?: boolean;
  movedFromSchema?: string;
  movedToSchema?: string;
  dropCascade?: boolean;
  dropColumn?: boolean;
  conditionalSourceRelation?: string;
  renamedToRelation?: string;
  renamedFromRelation?: string;
  renamedToConstraint?: string;
  renamedFromConstraint?: string;
  requiresExistingColumn?: boolean;
  requiresExistingConstraint?: boolean;
  foreignKeyTarget?: { localColumns: string[]; targetSchema: string | null; targetTable: string; targetColumns: string[] | null };
  uniqueKey?: { columns: string[]; primary: boolean; deferrable: boolean; initiallyDeferred: boolean; nullsNotDistinct: boolean; includeColumns: string[] };
  uniqueKeyUnverified?: boolean;
  indexColumns?: string[] | null;
  indexKeyTerms?: Array<{ column: string; direction: "ASC" | "DESC"; nulls: "FIRST" | "LAST" }> | null;
  indexIncludeColumns?: string[] | null;
  indexUnverifiedOptions?: string[];
  indexUnique?: boolean;
  indexNullsNotDistinct?: boolean;
  indexMethod?: string | null;
  indexHasPredicate?: boolean;
  indexPredicateExpression?: string | null;
  indexNameGenerated?: boolean;
  indexOnly?: boolean;
  indexConcurrently?: boolean;
  indexDropTargetCount?: number;
  indexConcurrentDropCascadeUnsupported?: boolean;
  statementStart?: number;
  relationType?: "table" | "view" | "materialized_view" | "any";
  version: string;
  filename: string;
};

function decodeUnicodeIdentifierBody(body: string, escapeCharacter: string) {
  const source = body.replaceAll('""', '"');
  let value = "";
  const readEscape = (index: number) => {
    if (source[index] !== escapeCharacter || index + 1 >= source.length) throw new Error("Invalid Unicode escape in PostgreSQL identifier");
    if (source[index + 1] === escapeCharacter) return { codePoint: escapeCharacter.codePointAt(0)!, next: index + 2 };
    const plusForm = source[index + 1] === "+";
    const digitStart = index + (plusForm ? 2 : 1);
    const digitCount = plusForm ? 6 : 4;
    const digits = source.slice(digitStart, digitStart + digitCount);
    if (digits.length !== digitCount || !/^[0-9a-f]+$/i.test(digits)) throw new Error("Invalid Unicode escape in PostgreSQL identifier");
    return { codePoint: Number.parseInt(digits, 16), next: digitStart + digitCount };
  };
  for (let index = 0; index < source.length;) {
    if (source[index] !== escapeCharacter) {
      const codePoint = source.codePointAt(index)!;
      value += String.fromCodePoint(codePoint);
      index += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    let escaped = readEscape(index);
    if (escaped.codePoint >= 0xd800 && escaped.codePoint <= 0xdbff) {
      const low = readEscape(escaped.next);
      if (low.codePoint < 0xdc00 || low.codePoint > 0xdfff) throw new Error("Invalid Unicode surrogate pair in PostgreSQL identifier");
      escaped = { codePoint: 0x10000 + ((escaped.codePoint - 0xd800) << 10) + (low.codePoint - 0xdc00), next: low.next };
    } else if (escaped.codePoint === 0 || (escaped.codePoint >= 0xdc00 && escaped.codePoint <= 0xdfff) || escaped.codePoint > 0x10ffff) {
      throw new Error("Invalid Unicode code point in PostgreSQL identifier");
    }
    value += String.fromCodePoint(escaped.codePoint);
    index = escaped.next;
  }
  return value;
}

function decodeUnicodeEscapedIdentifierTokens(source: string) {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const isUnicodeQuotedIdentifier = /^[uU]&"/.test(source.slice(index))
      && !isSqlIdentifierContinuationAt(source, index);
    if (isUnicodeQuotedIdentifier) {
      let closing = index + 3;
      while (closing < source.length) {
        if (source[closing] === '"' && source[closing + 1] === '"') closing += 2;
        else if (source[closing] === '"') break;
        else closing += 1;
      }
      if (closing >= source.length) throw new Error("Unterminated Unicode-escaped PostgreSQL identifier");
      const body = source.slice(index + 3, closing);
      let end = closing + 1;
      const escapeClause = source.slice(end).match(/^\s+UESCAPE\s+'((?:''|[^'])*)'/i);
      let escapeCharacter = "\\";
      if (escapeClause) {
        escapeCharacter = escapeClause[1].replaceAll("''", "'");
        end += escapeClause[0].length;
      }
      const escapeCharacters = [...escapeCharacter];
      if (escapeCharacters.length !== 1 || /[0-9a-f+"'\s]/i.test(escapeCharacter)) throw new Error("Invalid UESCAPE character in PostgreSQL identifier");
      const decoded = decodeUnicodeIdentifierBody(body, escapeCharacter);
      output += `"${decoded.replaceAll('"', '""')}"`;
      index = end;
      continue;
    }
    if (source[index] === '"') {
      output += source[index++];
      while (index < source.length) {
        output += source[index];
        if (source[index] === '"' && source[index + 1] === '"') {
          output += source[index + 1];
          index += 2;
        } else if (source[index++] === '"') break;
      }
      continue;
    }
    output += source[index++];
  }
  return output;
}

export function normalizeFlywayIdentifier(identifier: string) {
  identifier = decodeUnicodeEscapedIdentifierTokens(identifier);
  const parts: Array<{ value: string; quoted: boolean }> = [];
  let value = "";
  let quoted = false;
  let partWasQuoted = false;
  for (let index = 0; index < identifier.length; index += 1) {
    const character = identifier[index];
    if (character === '"') {
      if (quoted && identifier[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
        partWasQuoted = true;
      }
    } else if (character === "." && !quoted) {
      parts.push({ value, quoted: partWasQuoted });
      value = "";
      partWasQuoted = false;
    } else if (!quoted && /\s/.test(character)) {
      continue;
    } else {
      value += character;
    }
  }
  parts.push({ value, quoted: partWasQuoted });
  const last = parts.at(-1)!;
  return last.quoted ? last.value : last.value.toLowerCase();
}

const cleanIdentifier = normalizeFlywayIdentifier;
function splitQualifiedIdentifier(identifier: string) {
  const parts: string[] = [];
  // Split after U& tokens have been decoded, so dots inside quoted names stay protected.
  const normalized = decodeUnicodeEscapedIdentifierTokens(identifier);
  let quoted = false;
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === '"') {
      if (quoted && normalized[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
    } else if (normalized[index] === '.' && !quoted) {
      parts.push(normalized.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(normalized.slice(start).trim());
  return parts;
}
function getSchemaName(identifier: string) {
  const parts = splitQualifiedIdentifier(identifier);
  return parts.length > 1 ? normalizeFlywayIdentifier(parts.at(-2)!) : null;
}
function getOptionalSchemaEffect(identifier: string, property: "schemaName" | "tableSchemaName") {
  const schemaName = getSchemaName(identifier);
  return schemaName ? { [property]: schemaName } : {};
}
const sqlUnquotedIdentifier = String.raw`[_\p{L}][_$\p{L}\p{N}\p{M}]*`;
const sqlQuotedIdentifier = String.raw`(?:U&"(?:[^"]|"")*"(?:\s+UESCAPE\s+'(?:''|[^'])*')?|"(?:[^"]|"")*")`;
const sqlIdentifier = String.raw`(?:${sqlQuotedIdentifier}|${sqlUnquotedIdentifier})`;
const sqlQualifiedIdentifier = String.raw`${sqlIdentifier}(?:\s*\.\s*${sqlIdentifier})*`;
const sqlIdentifierBoundary = String.raw`(?<![\p{L}\p{N}\p{M}_$])`;
const sqlIdentifierEnd = String.raw`(?![\p{L}\p{N}\p{M}_$])`;
const sqlKeywordPattern = (keyword: string) => String.raw`${sqlIdentifierBoundary}(?:${keyword})${sqlIdentifierEnd}`;
function isSqlIdentifierContinuationAt(source: string, index: number) {
  if (index <= 0) return false;
  const last = source.charCodeAt(index - 1);
  const start = index > 1 && last >= 0xdc00 && last <= 0xdfff
    && source.charCodeAt(index - 2) >= 0xd800 && source.charCodeAt(index - 2) <= 0xdbff
    ? index - 2
    : index - 1;
  return /[\p{L}\p{N}\p{M}_$]/u.test(source.slice(start, index));
}

function splitSqlIdentifierList(source: string) {
  const parts: string[] = [];
  let start = 0;
  let quotedIdentifier = false;
  let quotedString = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && !quotedString) {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
    } else if (source[index] === "'" && !quotedIdentifier) {
      if (quotedString && source[index + 1] === "'") index += 1;
      else quotedString = !quotedString;
    } else if (!quotedIdentifier && !quotedString && source[index] === "(") depth += 1;
    else if (!quotedIdentifier && !quotedString && source[index] === ")") depth = Math.max(0, depth - 1);
    else if (!quotedIdentifier && !quotedString && depth === 0 && source[index] === ",") {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

export function matchesFlywayForeignKeyTargetKey(referenceColumns: string[], uniqueKeyColumns: string[]) {
  if (referenceColumns.length === 0 || referenceColumns.length !== uniqueKeyColumns.length) return false;
  if (new Set(referenceColumns).size !== referenceColumns.length || new Set(uniqueKeyColumns).size !== uniqueKeyColumns.length) return false;
  const uniqueKeySet = new Set(uniqueKeyColumns);
  return referenceColumns.every((column) => uniqueKeySet.has(column));
}

export type FlywayAvailableUniqueKey = {
  columns: string[];
  primary: boolean;
  deferrable: boolean;
  initiallyDeferred: boolean;
  nullsNotDistinct: boolean;
  includeColumns: string[];
  constraintName?: string;
  indexName?: string;
  backingIndexName?: string;
};

export type FlywayIndexConstraintOwner = {
  indexName: string;
  tableName: string;
  constraintName: string;
};

export function findFlywayIndexConstraintOwner(owners: FlywayIndexConstraintOwner[], indexName: string) {
  return owners.find((owner) => owner.indexName === indexName) ?? null;
}

export type FlywayIndexForeignKeyDependent = {
  indexName: string | null;
  tableName: string;
  constraintName: string | null;
  referencedTable?: string;
  localColumns?: string[];
  referencedColumns?: string[];
};

export function findFlywayIndexForeignKeyDependents(dependents: FlywayIndexForeignKeyDependent[], indexName: string) {
  return dependents.filter((dependent) => dependent.indexName === indexName);
}

export function findFlywayRelationDropForeignKeyDependents(
  dependents: FlywayIndexForeignKeyDependent[],
  relationName: string,
  relationsDroppedTogether: Set<string>,
) {
  return dependents.filter((dependent) =>
    dependent.referencedTable === relationName && !relationsDroppedTogether.has(dependent.tableName),
  );
}

export function findFlywayRelationDropForeignKeyDependencyIssues(
  drops: Array<{ name: string; statementStart: number; schemaName?: string | null }>,
  dependents: FlywayIndexForeignKeyDependent[],
) {
  const byStatement = new Map<number, typeof drops>();
  for (const drop of drops) {
    const statementDrops = byStatement.get(drop.statementStart) ?? [];
    statementDrops.push(drop);
    byStatement.set(drop.statementStart, statementDrops);
  }
  const issues: Array<{ statementStart: number; relationName: string; referencingTable: string; constraintName: string | null }> = [];
  for (const [statementStart, statementDrops] of byStatement) {
    const droppedRelations = new Set(statementDrops.map(({ name }) => name));
    for (const drop of statementDrops) {
      if (drop.schemaName && drop.schemaName !== "public") continue;
      for (const dependent of findFlywayRelationDropForeignKeyDependents(dependents, drop.name, droppedRelations)) {
        issues.push({ statementStart, relationName: drop.name, referencingTable: dependent.tableName, constraintName: dependent.constraintName });
      }
    }
  }
  return issues;
}

export function findFlywayColumnDropForeignKeyDependents(
  dependents: FlywayIndexForeignKeyDependent[],
  tableName: string,
  columnName: string,
) {
  return dependents.filter((dependent) =>
    (dependent.referencedTable === tableName && dependent.referencedColumns?.includes(columnName))
    || (dependent.tableName === tableName && dependent.localColumns?.includes(columnName)),
  );
}

export function findFlywayColumnDropForeignKeyDependencyIssues(
  drops: Array<{ name: string; tableName: string; statementStart: number; dropCascade?: boolean; tableSchemaName?: string | null }>,
  dependents: FlywayIndexForeignKeyDependent[],
) {
  const issues: Array<{ statementStart: number; tableName: string; columnName: string; referencingTable: string; constraintName: string | null }> = [];
  for (const drop of drops) {
    if (drop.dropCascade || (drop.tableSchemaName && drop.tableSchemaName !== "public")) continue;
    for (const dependent of findFlywayColumnDropForeignKeyDependents(dependents, drop.tableName, drop.name)) {
      if (dependent.tableName === drop.tableName) continue;
      issues.push({ statementStart: drop.statementStart, tableName: drop.tableName, columnName: drop.name, referencingTable: dependent.tableName, constraintName: dependent.constraintName });
    }
  }
  return issues;
}

export function findFlywayUniqueConstraintDropForeignKeyDependents(
  uniqueKeys: FlywayAvailableUniqueKey[],
  constraintName: string,
  dependents: FlywayIndexForeignKeyDependent[],
  tableName?: string,
) {
  const key = uniqueKeys.find((candidate) => candidate.constraintName === constraintName);
  if (!key) return [];
  if (key.backingIndexName) return findFlywayIndexForeignKeyDependents(dependents, key.backingIndexName);
  return tableName ? dependents.filter((dependent) => dependent.referencedTable === tableName) : [];
}

export function findFlywayUniqueConstraintDropForeignKeyDependencyIssues(
  drops: Array<{ name: string; tableName: string; statementStart: number; dropCascade?: boolean; renamedToConstraint?: string; requiresExistingConstraint?: boolean }>,
  uniqueKeysByTable: Map<string, FlywayAvailableUniqueKey[]>,
  dependents: FlywayIndexForeignKeyDependent[],
) {
  const projectedDependents = [...dependents];
  const issues: Array<{ statementStart: number; tableName: string; constraintName: string; backingIndexName: string | null; referencingTable: string; referencingConstraint: string | null }> = [];
  for (const drop of drops) {
    if (drop.renamedToConstraint || drop.requiresExistingConstraint) continue;
    const uniqueKeys = uniqueKeysByTable.get(drop.tableName) ?? [];
    const uniqueKey = uniqueKeys.find((key) => key.constraintName === drop.name);
    const backingIndexName = uniqueKey?.backingIndexName ?? uniqueKey?.indexName ?? null;
    const ownForeignKeys = projectedDependents.filter((dependent) =>
      dependent.tableName === drop.tableName && dependent.constraintName === drop.name,
    );
    if (drop.dropCascade) {
      if (backingIndexName) {
        for (let index = projectedDependents.length - 1; index >= 0; index -= 1) {
          if (projectedDependents[index].indexName === backingIndexName) projectedDependents.splice(index, 1);
        }
      }
      for (const dependent of ownForeignKeys) {
        const index = projectedDependents.indexOf(dependent);
        if (index >= 0) projectedDependents.splice(index, 1);
      }
      continue;
    }
    if (uniqueKey) {
      for (const dependent of findFlywayUniqueConstraintDropForeignKeyDependents(uniqueKeys, drop.name, projectedDependents, drop.tableName)) {
        issues.push({
          statementStart: drop.statementStart,
          tableName: drop.tableName,
          constraintName: drop.name,
          backingIndexName,
          referencingTable: dependent.tableName,
          referencingConstraint: dependent.constraintName,
        });
      }
    }
    for (const dependent of ownForeignKeys) {
      const index = projectedDependents.indexOf(dependent);
      if (index >= 0) projectedDependents.splice(index, 1);
    }
  }
  return issues;
}

export function removeFlywayUniqueKeysForDroppedConstraint(
  keys: FlywayAvailableUniqueKey[],
  constraintName: string,
  backingIndexName: string | null,
) {
  return keys.filter((key) => key.constraintName !== constraintName && (!backingIndexName || (key.indexName !== backingIndexName && key.backingIndexName !== backingIndexName)));
}

export function renameFlywayUniqueConstraintKey(
  keys: FlywayAvailableUniqueKey[],
  oldConstraintName: string,
  newConstraintName: string,
  oldBackingIndexName: string | null,
) {
  return keys.map((key) => ({
    ...key,
    ...(key.constraintName === oldConstraintName ? { constraintName: newConstraintName } : {}),
    ...(oldBackingIndexName && key.backingIndexName === oldBackingIndexName ? { backingIndexName: newConstraintName } : {}),
    ...(oldBackingIndexName && key.indexName === oldBackingIndexName ? { indexName: newConstraintName } : {}),
  }));
}

export function isFlywayIndexNameConflict(
  existingKind: string | undefined,
  existingParentTable: string | null,
  targetTable: string,
  ifNotExists: boolean,
) {
  return Boolean(existingKind && (existingKind !== "i" || existingParentTable !== targetTable || !ifNotExists));
}

export function findFlywayOwningUniqueConstraint(keys: FlywayAvailableUniqueKey[], indexName: string) {
  return keys.find((key) => key.backingIndexName === indexName && key.constraintName) ?? null;
}

export function isFlywayIndexDefinitionVerified(source: {
  keyTerms: Array<{ column: string; direction: "ASC" | "DESC"; nulls: "FIRST" | "LAST" }> | null;
  includeColumns: string[] | null;
  unverifiedOptions: string[];
  unique: boolean;
  nullsNotDistinct: boolean;
  method: string;
  hasPredicate: boolean;
  predicateExpression: string | null;
}, catalog: {
  keyTerms: Array<{ column: string; direction: "ASC" | "DESC"; nulls: "FIRST" | "LAST" }> | null;
  includeColumns: string[] | null;
  unique: boolean;
  nullsNotDistinct: boolean;
  method: string;
  hasPredicate: boolean;
  predicateExpression: string | null;
  isValid: boolean;
  isReady: boolean;
  isLive: boolean;
}) {
  return source.keyTerms !== null
    && catalog.keyTerms !== null
    && JSON.stringify(source.keyTerms) === JSON.stringify(catalog.keyTerms)
    && source.includeColumns !== null
    && catalog.includeColumns !== null
    && JSON.stringify(source.includeColumns) === JSON.stringify(catalog.includeColumns)
    && source.unverifiedOptions.length === 0
    && catalog.unique === source.unique
    && catalog.nullsNotDistinct === source.nullsNotDistinct
    && catalog.method === source.method
    && catalog.hasPredicate === source.hasPredicate
    && (source.hasPredicate
      ? source.predicateExpression !== null
        && catalog.predicateExpression !== null
        && !/(?:\bE\s*'|\bU&\s*'|\\|\$[_\p{L}][\p{L}\p{N}_]*\$|\$\$)/iu.test(source.predicateExpression)
        && !/(?:\bE\s*'|\bU&\s*'|\\|\$[_\p{L}][\p{L}\p{N}_]*\$|\$\$)/iu.test(catalog.predicateExpression)
        && normalizeFlywayCheckExpression(source.predicateExpression) === normalizeFlywayCheckExpression(catalog.predicateExpression)
      : source.predicateExpression === null && catalog.predicateExpression === null)
    && catalog.isValid
    && catalog.isReady
    && catalog.isLive;
}

function findKeywordParenthesizedClause(source: string, keywordPattern: RegExp) {
  return findKeywordParenthesizedClauses(source, keywordPattern)[0] ?? null;
}

function findKeywordParenthesizedClauses(source: string, keywordPattern: RegExp) {
  const clauses: Array<{ match: RegExpExecArray; keywordStart: number; content: string; contentStart: number; contentEnd: number }> = [];
  let quotedIdentifier = false;
  let quotedString = false;
  let outerDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && !quotedString) {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
      continue;
    }
    if (source[index] === "'" && !quotedIdentifier) {
      if (quotedString && source[index + 1] === "'") index += 1;
      else quotedString = !quotedString;
      continue;
    }
    if (quotedIdentifier || quotedString) continue;
    if (source[index] === "(") {
      outerDepth += 1;
      continue;
    }
    if (source[index] === ")") {
      outerDepth = Math.max(0, outerDepth - 1);
      continue;
    }
    if (outerDepth !== 0 || isSqlIdentifierContinuationAt(source, index)) continue;
    const keyword = keywordPattern.exec(source.slice(index));
    if (!keyword) continue;
    let opening = index + keyword[0].length;
    while (/\s/.test(source[opening] ?? "")) opening += 1;
    if (source[opening] !== "(") continue;
    let clauseDepth = 0;
    let innerQuotedIdentifier = false;
    let innerQuotedString = false;
    for (let cursor = opening; cursor < source.length; cursor += 1) {
      if (source[cursor] === '"' && !innerQuotedString) {
        if (innerQuotedIdentifier && source[cursor + 1] === '"') cursor += 1;
        else innerQuotedIdentifier = !innerQuotedIdentifier;
      } else if (source[cursor] === "'" && !innerQuotedIdentifier) {
        if (innerQuotedString && source[cursor + 1] === "'") cursor += 1;
        else innerQuotedString = !innerQuotedString;
      } else if (!innerQuotedIdentifier && !innerQuotedString && source[cursor] === "(") clauseDepth += 1;
      else if (!innerQuotedIdentifier && !innerQuotedString && source[cursor] === ")") {
        clauseDepth -= 1;
        if (clauseDepth === 0) {
          clauses.push({ match: keyword, keywordStart: index, content: source.slice(opening + 1, cursor), contentStart: opening + 1, contentEnd: cursor });
          index = cursor;
          break;
        }
      }
    }
  }
  return clauses;
}

export function extractFlywayCheckExpression(constraintDefinition: string) {
  const maskedDefinition = maskSqlCommentsAndLiterals(constraintDefinition);
  const checkClause = findKeywordParenthesizedClause(maskedDefinition, new RegExp(`${sqlKeywordPattern("CHECK")}\\s*`, "iu"));
  return checkClause
    ? constraintDefinition.slice(checkClause.contentStart, checkClause.contentEnd)
    : null;
}

function splitSqlStatementRanges(sql: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  let quotedIdentifier = false;
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] === '"') {
      if (quotedIdentifier && sql[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
    } else if (!quotedIdentifier && sql[index] === ";") {
      ranges.push({ start, end: index });
      start = index + 1;
    }
  }
  ranges.push({ start, end: sql.length });
  return ranges;
}

function isTopLevelSqlPosition(source: string, position: number) {
  let depth = 0;
  let quotedIdentifier = false;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === '"') {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
    } else if (!quotedIdentifier && source[index] === "(") depth += 1;
    else if (!quotedIdentifier && source[index] === ")") depth = Math.max(0, depth - 1);
  }
  return !quotedIdentifier && depth === 0;
}

function findNextTopLevelCommaIndex(source: string, start: number) {
  let depth = 0;
  let quotedIdentifier = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '"') {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
    } else if (!quotedIdentifier && source[index] === "(") depth += 1;
    else if (!quotedIdentifier && source[index] === ")") depth = Math.max(0, depth - 1);
    else if (!quotedIdentifier && depth === 0 && source[index] === ",") return index;
  }
  return source.length;
}

export function normalizeFlywayCheckExpression(expression: string) {
  let normalized = expression.trim();
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    let depth = 0;
    let quote: "single" | "double" | null = null;
    let wrapsWholeExpression = true;
    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index];
      if (quote === "single") {
        if (character === "'" && normalized[index + 1] === "'") index += 1;
        else if (character === "'") quote = null;
      } else if (quote === "double") {
        if (character === '"' && normalized[index + 1] === '"') index += 1;
        else if (character === '"') quote = null;
      } else if (character === "'") quote = "single";
      else if (character === '"') quote = "double";
      else if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0 && index < normalized.length - 1) {
          wrapsWholeExpression = false;
          break;
        }
      }
    }
    if (!wrapsWholeExpression) break;
    normalized = normalized.slice(1, -1).trim();
  }
  let result = "";
  let quote: "single" | "double" | null = null;
  const punctuation = new Set(["(", ")", ",", "=", "<", ">", "+", "*", "/", "-", "!", ":", "|", "&", "%", "^", "~", "."]);
  const operatorCharacter = /[~!@#%^&|`?+\-*/<>:=]/u;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (quote === "single") {
      result += character;
      if (character === "'" && normalized[index + 1] === "'") result += normalized[++index];
      else if (character === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      result += character;
      if (character === '"' && normalized[index + 1] === '"') result += normalized[++index];
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "'") {
      result = result.trimEnd();
      quote = "single";
      result += character;
    } else if (character === '"') {
      result = result.trimEnd();
      quote = "double";
      result += character;
    } else if (/\s/.test(character)) {
      let nextIndex = index + 1;
      while (/\s/.test(normalized[nextIndex] ?? "")) nextIndex += 1;
      const previousCharacter = normalized[index - 1] ?? "";
      const nextCharacter = normalized[nextIndex] ?? "";
      const separatesOperators = operatorCharacter.test(previousCharacter) && operatorCharacter.test(nextCharacter);
      if (separatesOperators) {
        if (result && !result.endsWith(" ")) result += " ";
      } else if (result && !result.endsWith(" ") && !punctuation.has(result.at(-1)!) || result.endsWith(")")) result += " ";
    } else if (punctuation.has(character)) {
      const previousNonWhitespace = result.trimEnd().at(-1) ?? "";
      const preserveOperatorSeparator = result.endsWith(" ")
        && operatorCharacter.test(previousNonWhitespace)
        && operatorCharacter.test(character);
      result = (preserveOperatorSeparator ? result : result.trimEnd()) + character;
    } else {
      if (result.endsWith(")")) result += " ";
      result += character.toLowerCase();
    }
  }
  return result.trim();
}

export function compareFlywayCheckExpressions(sourceExpression: string, catalogExpression: string) {
  if (normalizeFlywayCheckExpression(sourceExpression) === normalizeFlywayCheckExpression(catalogExpression)) return "match" as const;
  if (/\bIN\s*\(/i.test(sourceExpression) && /\bANY\s*\(|\bARRAY\s*\[|::/i.test(catalogExpression)) return "unverified" as const;
  if (!/::/.test(sourceExpression) && /::/.test(catalogExpression)) return "unverified" as const;
  return "mismatch" as const;
}

function parseSimpleIndexColumns(columnList: string): string[] | null {
  const columns = splitSqlIdentifierList(columnList).map((part) => {
    const match = new RegExp(String.raw`^(${sqlIdentifier})(?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?$`, "iu").exec(part.trim());
    if (!match) return null;
    return normalizeFlywayIdentifier(match[1]);
  });
  return columns.length > 0 && columns.every((column): column is string => column !== null) ? columns : null;
}

export function hasTopLevelSqlKeyword(source: string, keyword: string) {
  let quotedIdentifier = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"') {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
      continue;
    }
    if (quotedIdentifier) continue;
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && source.slice(index, index + keyword.length).toUpperCase() === keyword.toUpperCase()) {
      const nextCodePoint = source.codePointAt(index + keyword.length);
      const nextContinuesIdentifier = nextCodePoint !== undefined
        && /[\p{L}\p{N}\p{M}_$]/u.test(String.fromCodePoint(nextCodePoint));
      if (!isSqlIdentifierContinuationAt(source, index) && !nextContinuesIdentifier) return true;
    }
  }
  return false;
}

function findTopLevelSqlKeywordIndex(source: string, keyword: string) {
  let quotedIdentifier = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"') {
      if (quotedIdentifier && source[index + 1] === '"') index += 1;
      else quotedIdentifier = !quotedIdentifier;
      continue;
    }
    if (quotedIdentifier) continue;
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && source.slice(index, index + keyword.length).toUpperCase() === keyword.toUpperCase()) {
      const nextCodePoint = source.codePointAt(index + keyword.length);
      const nextContinuesIdentifier = nextCodePoint !== undefined
        && /[\p{L}\p{N}\p{M}_$]/u.test(String.fromCodePoint(nextCodePoint));
      if (!isSqlIdentifierContinuationAt(source, index) && !nextContinuesIdentifier) return index;
    }
  }
  return -1;
}

export function parseFlywayIndexKeyTerms(columnList: string) {
  const terms = splitSqlIdentifierList(columnList).map((part) => {
    const match = new RegExp(String.raw`^(${sqlIdentifier})(?:\s+(ASC|DESC))?(?:\s+NULLS\s+(FIRST|LAST))?$`, "iu").exec(part.trim());
    if (!match) return null;
    const column = normalizeFlywayIdentifier(match[1]);
    const direction = (match[2]?.toUpperCase() ?? "ASC") as "ASC" | "DESC";
    const nulls = (match[3]?.toUpperCase() ?? (direction === "DESC" ? "FIRST" : "LAST")) as "FIRST" | "LAST";
    return { column, direction, nulls };
  });
  return terms.some((term) => term === null) ? null : terms as Array<{ column: string; direction: "ASC" | "DESC"; nulls: "FIRST" | "LAST" }>;
}

/** Masks comments and literal bodies while retaining quoted identifiers and line breaks. */
function maskSqlCommentsAndLiterals(source: string, preserveLiterals = false) {
  let output = "";
  let index = 0;
  let unicodeEscapeIdentifierEnd: number | null = null;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "-" && next === "-") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "*") {
      let depth = 1;
      output += "  ";
      index += 2;
      while (index < source.length && depth > 0) {
        if (source[index] === "/" && source[index + 1] === "*") {
          output += "  ";
          depth += 1;
          index += 2;
        } else if (source[index] === "*" && source[index + 1] === "/") {
          output += "  ";
          depth -= 1;
          index += 2;
        } else {
          output += /[\r\n]/.test(source[index]) ? source[index] : " ";
          index += 1;
        }
      }
      continue;
    }
    if (current === "'" && !preserveLiterals && unicodeEscapeIdentifierEnd !== null
      && /^\s+UESCAPE\s*$/i.test(source.slice(unicodeEscapeIdentifierEnd, index))) {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "'" && source[end + 1] === "'") end += 2;
        else if (source[end++] === "'") break;
      }
      output += source.slice(index, end);
      index = end;
      unicodeEscapeIdentifierEnd = null;
      continue;
    }
    if (current === "'") {
      if (preserveLiterals) {
        const start = index;
        const escapeString = /[eE]/.test(source[index - 1] ?? "") && !isSqlIdentifierContinuationAt(source, index - 1);
        index += 1;
        while (index < source.length) {
          if (escapeString && source[index] === "\\" && index + 1 < source.length) index += 2;
          else if (source[index] === "'" && source[index + 1] === "'") index += 2;
          else if (source[index++] === "'") break;
        }
        output += source.slice(start, index);
        continue;
      }
      const escapeString = /[eE]/.test(source[index - 1] ?? "") && !isSqlIdentifierContinuationAt(source, index - 1);
      output += " ";
      index += 1;
      while (index < source.length) {
        if (escapeString && source[index] === "\\" && index + 1 < source.length) {
          output += "  ";
          index += 2;
        } else if (source[index] === "'" && source[index + 1] === "'") {
          output += "  ";
          index += 2;
        } else if (source[index] === "'") {
          output += " ";
          index += 1;
          break;
        } else {
          output += /[\r\n]/.test(source[index]) ? source[index] : " ";
          index += 1;
        }
      }
      continue;
    }
    if (current === '"') {
      const unicodeEscapedIdentifier = index >= 2 && /^[uU]&$/.test(source.slice(index - 2, index))
        && !isSqlIdentifierContinuationAt(source, index - 2);
      output += current;
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') {
          output += '""';
          index += 2;
        } else {
          const character = source[index];
          output += character;
          index += 1;
          if (character === '"') {
            closed = true;
            break;
          }
        }
      }
      if (unicodeEscapedIdentifier && closed) unicodeEscapeIdentifierEnd = index;
      continue;
    }
    if (current === "$") {
      const previous = source.slice(Math.max(0, index - 2), index).match(/[\s\S]$/u)?.[0] ?? "";
      const followsIdentifier = /[\p{L}\p{N}\p{M}_$]/u.test(previous);
      const delimiter = followsIdentifier ? undefined : source.slice(index).match(/^\$(?:[_\p{L}][_\p{L}\p{N}\p{M}]*)?\$/u)?.[0];
      if (delimiter) {
        const closingIndex = source.indexOf(delimiter, index + delimiter.length);
        const end = closingIndex < 0 ? source.length : closingIndex + delimiter.length;
        const literal = source.slice(index, end);
        output += preserveLiterals ? literal : literal.replace(/[^\r\n]/g, " ");
        index = end;
        continue;
      }
    }
    output += current;
    index += 1;
  }
  return output;
}

function findSelectIntoTargets(sql: string) {
  const targets: Array<{ name: string; index: number }> = [];
  for (const range of splitSqlStatementRanges(sql)) {
    const start = range.start;
    const end = range.end;
    const statement = sql.slice(start, end);
    let depth = 0;
    let quote = false;
    const topLevelKeywords: Array<{ keyword: string; index: number; end: number }> = [];
    for (let index = 0; index < statement.length; index += 1) {
      if (statement[index] === '"') {
        if (quote && statement[index + 1] === '"') index += 1;
        else quote = !quote;
      } else if (!quote && statement[index] === "(") depth += 1;
      else if (!quote && statement[index] === ")") depth = Math.max(0, depth - 1);
      else if (!quote && depth === 0) {
        if (isSqlIdentifierContinuationAt(statement, index)) continue;
        const keyword = new RegExp(String.raw`^(SELECT|INTO)${sqlIdentifierEnd}`, "iu").exec(statement.slice(index));
        if (keyword) {
          topLevelKeywords.push({ keyword: keyword[1].toUpperCase(), index, end: index + keyword[0].length });
          index += keyword[0].length - 1;
        }
      }
    }
    const selects = topLevelKeywords.filter(({ keyword }) => keyword === "SELECT");
    for (const [selectIndex, select] of selects.entries()) {
      const into = topLevelKeywords.find(({ keyword, index }) => keyword === "INTO" && index > select.end);
      if (!into) continue;
      if (selects[selectIndex + 1] && selects[selectIndex + 1].index < into.index) continue;
      const target = new RegExp(String.raw`^\s+(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?(?:TABLE\s+)?(${sqlQualifiedIdentifier})`, "iu").exec(statement.slice(into.end));
      if (target) targets.push({ name: target[1], index: start + into.end + target.index + target[0].lastIndexOf(target[1]) });
    }
  }
  return targets;
}

export function parseFlywayCreateTableColumns(migration: FlywayMigrationSql) {
  const sql = maskSqlCommentsAndLiterals(migration.sql);
  const sqlWithLiterals = maskSqlCommentsAndLiterals(migration.sql, true);
  const createdTables: Array<{
    tableName: string;
    columns: string[];
    namedConstraints: string[];
    likeSource: { tableName: string; options: string[] } | null;
    uniqueKeys: Array<{ columns: string[]; primary: boolean; deferrable: boolean; initiallyDeferred: boolean; nullsNotDistinct: boolean; includeColumns: string[]; constraintName?: string }>;
    checks: Array<{ expression: string; name: string | null; noInherit: boolean }>;
    unsupportedConstraints: Array<{ name: string | null; kind: "exclude" }>;
    references: Array<{ localColumns: string[]; targetSchema: string | null; targetTable: string; targetColumns: string[] | null; constraintName?: string; matchType: "FULL" | "PARTIAL" | "SIMPLE"; onDelete: "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT"; onDeleteColumns: string[] | null; onUpdate: "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT"; deferrable: boolean; initiallyDeferred: boolean }>;
  }> = [];
  const reserved = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);
  const createTablePattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${sqlQualifiedIdentifier})\s*\(`, "giu");
  for (const match of sql.matchAll(createTablePattern)) {
    const openingIndex = match.index! + match[0].lastIndexOf("(");
    let depth = 0;
    let quotedIdentifier = false;
    let closingIndex = -1;
    for (let index = openingIndex; index < sql.length; index += 1) {
      if (sql[index] === '"') {
        if (quotedIdentifier && sql[index + 1] === '"') {
          index += 1;
          continue;
        }
        quotedIdentifier = !quotedIdentifier;
      } else if (!quotedIdentifier && sql[index] === "(") depth += 1;
      else if (!quotedIdentifier && sql[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          closingIndex = index;
          break;
        }
      }
    }
    if (closingIndex < 0) continue;
    const body = sql.slice(openingIndex + 1, closingIndex);
    const rawBody = sqlWithLiterals.slice(openingIndex + 1, closingIndex);
    const columns: string[] = [];
    const namedConstraints: string[] = [];
    const uniqueKeys: Array<{ columns: string[]; primary: boolean; deferrable: boolean; initiallyDeferred: boolean; nullsNotDistinct: boolean; includeColumns: string[]; constraintName?: string }> = [];
    const checks: Array<{ expression: string; name: string | null; noInherit: boolean }> = [];
    const unsupportedConstraints: Array<{ name: string | null; kind: "exclude" }> = [];
    const references: Array<{ localColumns: string[]; targetSchema: string | null; targetTable: string; targetColumns: string[] | null; constraintName?: string; matchType: "FULL" | "PARTIAL" | "SIMPLE"; onDelete: "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT"; onDeleteColumns: string[] | null; onUpdate: "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT"; deferrable: boolean; initiallyDeferred: boolean }> = [];
    let likeSource: { tableName: string; options: string[] } | null = null;
    let start = 0;
    depth = 0;
    quotedIdentifier = false;
    for (let index = 0; index <= body.length; index += 1) {
      const character = body[index];
      if (character === '"') {
        if (quotedIdentifier && body[index + 1] === '"') {
          index += 1;
          continue;
        }
        quotedIdentifier = !quotedIdentifier;
      } else if (!quotedIdentifier && character === "(") depth += 1;
      else if (!quotedIdentifier && character === ")") depth -= 1;
      else if (index === body.length || (!quotedIdentifier && depth === 0 && character === ",")) {
        const definition = body.slice(start, index).trim();
        const rawDefinition = rawBody.slice(start, index).trim();
        const namedTableConstraint = new RegExp(String.raw`^\s*CONSTRAINT\s+(${sqlIdentifier})`, "iu").exec(definition);
        if (namedTableConstraint) namedConstraints.push(cleanIdentifier(namedTableConstraint[1]));
        const likeMatch = new RegExp(String.raw`^LIKE\s+(${sqlQualifiedIdentifier})`, "iu").exec(definition);
        if (likeMatch) {
          likeSource = {
            tableName: cleanIdentifier(likeMatch[1]),
            options: [...definition.matchAll(new RegExp(`${sqlKeywordPattern("(INCLUDING|EXCLUDING)")}\\s+([A-Z_]+)`, "giu"))].map((option) => `${option[1].toUpperCase()} ${option[2].toUpperCase()}`),
          };
        }
        const columnMatch = new RegExp(String.raw`^(${sqlQuotedIdentifier}|(${sqlUnquotedIdentifier}))\s+`, "iu").exec(definition);
        const name = columnMatch?.[1]
          ? cleanIdentifier(columnMatch[1])
          : columnMatch?.[2]?.toLowerCase();
        const primaryKeyMatch = findKeywordParenthesizedClause(definition, /^PRIMARY\s+KEY\s*/i);
        const uniqueConstraintMatch = findKeywordParenthesizedClause(definition, /^UNIQUE(?:\s+NULLS\s+(NOT\s+)?DISTINCT)?\s*/i);
        const keyConstraintNameMatches = [...definition.matchAll(new RegExp(`${sqlKeywordPattern("CONSTRAINT")}\\s+(${sqlIdentifier})`, "giu"))];
        const keyConstraintName = keyConstraintNameMatches.length > 0
          ? cleanIdentifier(keyConstraintNameMatches.at(-1)![1])
          : undefined;
        const deferrable = new RegExp(sqlKeywordPattern("DEFERRABLE"), "iu").test(definition) && !new RegExp(sqlKeywordPattern("NOT\\s+DEFERRABLE"), "iu").test(definition);
        const initiallyDeferred = new RegExp(sqlKeywordPattern("INITIALLY\\s+DEFERRED"), "iu").test(definition);
        const includeColumnsMatch = findKeywordParenthesizedClause(definition, /^INCLUDE\s*/i);
        const includeColumns = includeColumnsMatch ? splitSqlIdentifierList(includeColumnsMatch.content).map(cleanIdentifier) : [];
        const checkClauses = findKeywordParenthesizedClauses(definition, new RegExp(`${sqlKeywordPattern("CHECK")}\\s*`, "iu"));
        for (const checkClause of checkClauses) {
          const checkExpression = rawDefinition.slice(checkClause.contentStart, checkClause.contentEnd);
          const constraintPrefix = definition.slice(0, checkClause.keywordStart);
          const constraintName = new RegExp(String.raw`(?:^|\s)CONSTRAINT\s+(${sqlIdentifier})\s*$`, "iu").exec(constraintPrefix);
          checks.push({
            expression: normalizeFlywayCheckExpression(checkExpression),
            name: constraintName ? normalizeFlywayIdentifier(constraintName[1]) : null,
            noInherit: new RegExp(`^\\s*${sqlKeywordPattern("NO\\s+INHERIT")}`, "iu").test(rawDefinition.slice(checkClause.contentEnd + 1)),
          });
        }
        if (new RegExp(sqlKeywordPattern("EXCLUDE\\s+USING"), "iu").test(definition)) {
          const constraintName = new RegExp(String.raw`^\s*CONSTRAINT\s+(${sqlIdentifier})`, "iu").exec(definition);
          unsupportedConstraints.push({
            name: constraintName ? normalizeFlywayIdentifier(constraintName[1]) : null,
            kind: "exclude",
          });
        }
        if (primaryKeyMatch) {
          uniqueKeys.push({
            columns: splitSqlIdentifierList(primaryKeyMatch.content).map(cleanIdentifier),
            primary: true,
            deferrable,
            initiallyDeferred,
            nullsNotDistinct: false,
            includeColumns,
            ...(keyConstraintName ? { constraintName: keyConstraintName } : {}),
          });
        } else if (uniqueConstraintMatch) {
          uniqueKeys.push({
            columns: splitSqlIdentifierList(uniqueConstraintMatch.content).map(cleanIdentifier),
            primary: false,
            deferrable,
            initiallyDeferred,
            nullsNotDistinct: Boolean(uniqueConstraintMatch.match[1]),
            includeColumns,
            ...(keyConstraintName ? { constraintName: keyConstraintName } : {}),
          });
        } else if (name && new RegExp(sqlKeywordPattern("PRIMARY\\s+KEY"), "iu").test(definition)) {
          uniqueKeys.push({ columns: [name], primary: true, deferrable, initiallyDeferred, nullsNotDistinct: false, includeColumns, ...(keyConstraintName ? { constraintName: keyConstraintName } : {}) });
        } else if (name && new RegExp(sqlKeywordPattern("UNIQUE"), "iu").test(definition)) {
          uniqueKeys.push({ columns: [name], primary: false, deferrable, initiallyDeferred, nullsNotDistinct: new RegExp(sqlKeywordPattern("UNIQUE\\s+NULLS\\s+NOT\\s+DISTINCT"), "iu").test(definition), includeColumns, ...(keyConstraintName ? { constraintName: keyConstraintName } : {}) });
        }
        const referenceMatch = new RegExp(`${sqlKeywordPattern("REFERENCES")}\\s+(${sqlQualifiedIdentifier})\\s*(?:\\(((?:"(?:[^"]|"")*"|[^)])*)\\))?`, "iu").exec(definition);
        if (referenceMatch) {
          const referenceTargetParts = splitQualifiedIdentifier(referenceMatch[1]);
          const referenceClause = definition.slice(referenceMatch.index);
          const referentialAction = (operation: "DELETE" | "UPDATE") => {
            const action = new RegExp(`\\bON\\s+${operation}\\s+(NO\\s+ACTION|RESTRICT|CASCADE|SET\\s+NULL|SET\\s+DEFAULT)`, "i").exec(referenceClause)?.[1];
            return (action?.replaceAll(/\s+/g, " ").toUpperCase() ?? "NO ACTION") as "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";
          };
          const onDeleteColumnsMatch = /\bON\s+DELETE\s+(?:SET\s+NULL|SET\s+DEFAULT)\s*\(([^()]*)\)/i.exec(referenceClause);
          const onDeleteColumns = onDeleteColumnsMatch ? splitSqlIdentifierList(onDeleteColumnsMatch[1]).map(cleanIdentifier) : null;
          const tableForeignKeyClause = findKeywordParenthesizedClause(definition, new RegExp(String.raw`^(?:CONSTRAINT\s+${sqlIdentifier}\s+)?FOREIGN\s+KEY\s*`, "iu"));
          const constraintTokens = [...definition.slice(0, referenceMatch.index).matchAll(new RegExp(`${sqlKeywordPattern("CONSTRAINT")}\\s+(${sqlIdentifier})`, "giu"))];
          const foreignKeyConstraintName = constraintTokens.length > 0
            ? cleanIdentifier(constraintTokens.at(-1)![1])
            : undefined;
          const localColumns = tableForeignKeyClause
            ? splitSqlIdentifierList(tableForeignKeyClause.content).map(cleanIdentifier)
            : (name && !/^constraint$/i.test(name) ? [name] : []);
          references.push({
            localColumns,
            targetSchema: referenceTargetParts.length > 1
              ? cleanIdentifier(referenceTargetParts.at(-2)!)
              : null,
            targetTable: cleanIdentifier(referenceMatch[1]),
            targetColumns: referenceMatch[2] === undefined
              ? null
              : splitSqlIdentifierList(referenceMatch[2]).map(cleanIdentifier),
            ...(foreignKeyConstraintName ? { constraintName: foreignKeyConstraintName } : {}),
            matchType: /\bMATCH\s+FULL\b/i.test(referenceClause) ? "FULL" : /\bMATCH\s+PARTIAL\b/i.test(referenceClause) ? "PARTIAL" : "SIMPLE",
            onDelete: referentialAction("DELETE"),
            onDeleteColumns,
            onUpdate: referentialAction("UPDATE"),
            deferrable: new RegExp(sqlKeywordPattern("DEFERRABLE"), "iu").test(referenceClause) && !new RegExp(sqlKeywordPattern("NOT\\s+DEFERRABLE"), "iu").test(referenceClause),
            initiallyDeferred: new RegExp(sqlKeywordPattern("INITIALLY\\s+DEFERRED"), "iu").test(referenceClause),
          });
        }
        if (name && !reserved.has(name.toLowerCase())) columns.push(name);
        start = index + 1;
      }
    }
    createdTables.push({ tableName: cleanIdentifier(match[1]), columns, namedConstraints, likeSource, uniqueKeys, checks, unsupportedConstraints, references });
  }
  return createdTables;
}

export function parseFlywayCreateTableSpecialDefinitions(migration: FlywayMigrationSql) {
  const sql = maskSqlCommentsAndLiterals(migration.sql);
  const definitions: Array<{ tableName: string; feature: "AS_QUERY" | "TYPED_TABLE" | "PARTITION_OF" | "PARTITIONED_TABLE" | "INHERITS" | "SELECT_INTO"; sourceTable: string | null; options: string[] }> = [];
  const prefix = String.raw`${sqlIdentifierBoundary}CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`;
  for (const match of sql.matchAll(new RegExp(`${prefix}\\s+AS\\b`, "giu"))) {
    definitions.push({ tableName: cleanIdentifier(match[1]), feature: "AS_QUERY", sourceTable: null, options: [] });
  }
  for (const match of sql.matchAll(new RegExp(`${prefix}\\s+OF\\s+(${sqlQualifiedIdentifier})`, "giu"))) {
    definitions.push({ tableName: cleanIdentifier(match[1]), feature: "TYPED_TABLE", sourceTable: cleanIdentifier(match[2]), options: [] });
  }
  for (const match of sql.matchAll(new RegExp(`${prefix}\\s+PARTITION\\s+OF\\s+(${sqlQualifiedIdentifier})`, "giu"))) {
    definitions.push({ tableName: cleanIdentifier(match[1]), feature: "PARTITION_OF", sourceTable: cleanIdentifier(match[2]), options: [] });
  }
  for (const match of sql.matchAll(new RegExp(`${prefix}\\s*(?:\\((?:[^()]|\\([^()]*\\))*\\))?\\s+PARTITION\\s+BY\\s+(RANGE|LIST|HASH)`, "giu"))) {
    definitions.push({ tableName: cleanIdentifier(match[1]), feature: "PARTITIONED_TABLE", sourceTable: null, options: [match[2].toUpperCase()] });
  }
  for (const match of sql.matchAll(new RegExp(`${prefix}\\s*(?:\\((?:[^()]|\\([^()]*\\))*\\))?\\s+INHERITS\\s*\\(((?:"(?:[^"]|"")*"|[^)])*)\\)`, "giu"))) {
    const parents = splitSqlIdentifierList(match[2]).map(cleanIdentifier).filter(Boolean);
    definitions.push({ tableName: cleanIdentifier(match[1]), feature: "INHERITS", sourceTable: parents.join(","), options: parents });
  }
  for (const match of findSelectIntoTargets(sql)) {
    definitions.push({ tableName: cleanIdentifier(match.name), feature: "SELECT_INTO", sourceTable: null, options: [] });
  }
  return definitions;
}

export function parseFlywayDdlEffects(migration: FlywayMigrationSql): DdlEffect[] {
  const sql = maskSqlCommentsAndLiterals(migration.sql);
  const sqlWithLiterals = maskSqlCommentsAndLiterals(migration.sql, true);
  const statementRanges = splitSqlStatementRanges(sql);
  const orderedEffects: Array<{ order: number; effect: DdlEffect }> = [];
  const add = (effect: Omit<DdlEffect, "version" | "filename">, order: number) => orderedEffects.push({
    order,
    effect: { ...effect, version: migration.version, filename: migration.filename },
  });

  const createTableEffectPattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`, "giu");
  for (const match of sql.matchAll(createTableEffectPattern)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[1]), relationType: "table", ...getOptionalSchemaEffect(match[1], "schemaName") }, match.index!);
  }
  for (const match of findSelectIntoTargets(sql)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match.name), relationType: "table", ...getOptionalSchemaEffect(match.name, "schemaName") }, match.index);
  }
  const createMaterializedViewPattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`, "giu");
  for (const match of sql.matchAll(createMaterializedViewPattern)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[1]), relationType: "materialized_view", ...getOptionalSchemaEffect(match[1], "schemaName") }, match.index!);
  }
  const createViewPattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(${sqlQualifiedIdentifier})`, "giu");
  for (const match of sql.matchAll(createViewPattern)) {
    add({ kind: "relation", operation: "present", name: cleanIdentifier(match[1]), relationType: "view", ...getOptionalSchemaEffect(match[1], "schemaName") }, match.index!);
  }
  const dropMaterializedViewPattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+MATERIALIZED\s+VIEW\s+(?:IF\s+EXISTS\s+)?(${sqlQualifiedIdentifier}(?:\s*,\s*${sqlQualifiedIdentifier})*)`, "giu");
  for (const match of sql.matchAll(dropMaterializedViewPattern)) {
    const statementRange = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
    const remainder = statementRange ? sql.slice(match.index! + match[0].length, statementRange.end) : "";
    const cascade = hasTopLevelSqlKeyword(remainder, "CASCADE");
    for (const identifier of splitSqlIdentifierList(match[1])) {
      add({ kind: "relation", operation: "absent", name: cleanIdentifier(identifier), relationType: "materialized_view", statementStart: statementRange?.start ?? match.index!, ...(cascade ? { dropCascade: true } : {}), ...getOptionalSchemaEffect(identifier, "schemaName") }, match.index!);
    }
  }
  const dropTablePattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${sqlQualifiedIdentifier}(?:\s*,\s*${sqlQualifiedIdentifier})*)`, "giu");
  for (const match of sql.matchAll(dropTablePattern)) {
    const statementRange = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
    const remainder = statementRange ? sql.slice(match.index! + match[0].length, statementRange.end) : "";
    const cascade = hasTopLevelSqlKeyword(remainder, "CASCADE");
    for (const identifier of splitSqlIdentifierList(match[1])) {
      add({ kind: "relation", operation: "absent", name: cleanIdentifier(identifier), relationType: "any", statementStart: statementRange?.start ?? match.index!, ...(cascade ? { dropCascade: true } : {}), ...getOptionalSchemaEffect(identifier, "schemaName") }, match.index!);
    }
  }
  const renameTablePattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(?:ONLY\s+)?(${sqlQualifiedIdentifier})\s+RENAME\s+TO\s+(${sqlIdentifier})`, "giu");
  for (const match of sql.matchAll(renameTablePattern)) {
    const sourceName = cleanIdentifier(match[2]);
    const tableIfExists = Boolean(match[1]);
    add({
      kind: "relation",
      operation: "absent",
      name: sourceName,
      ...getOptionalSchemaEffect(match[2], "schemaName"),
      relationType: "any",
      renamedToRelation: cleanIdentifier(match[3]),
      ...(tableIfExists ? { ifExists: true } : {}),
    }, match.index!);
    add({
      kind: "relation",
      operation: "present",
      name: cleanIdentifier(match[3]),
      ...getOptionalSchemaEffect(match[2], "schemaName"),
      relationType: "any",
      renamedFromRelation: sourceName,
      ...(tableIfExists ? { conditionalSourceRelation: sourceName } : {}),
    }, match.index! + match[0].lastIndexOf(match[3]));
  }
  const setTableSchemaPattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(?:ONLY\s+)?(${sqlQualifiedIdentifier})\s+SET\s+SCHEMA\s+(${sqlIdentifier})`, "giu");
  for (const match of sql.matchAll(setTableSchemaPattern)) {
    if (!isTopLevelSqlPosition(sql, match.index!)) continue;
    const sourceName = cleanIdentifier(match[2]);
    const sourceSchema = getSchemaName(match[2]);
    const targetSchema = cleanIdentifier(match[3]);
    const sourceIsPublic = !sourceSchema || sourceSchema === "public";
    const targetIsPublic = targetSchema === "public";
    if (sourceIsPublic && !targetIsPublic) {
      add({
        kind: "relation",
        operation: "absent",
        name: sourceName,
        relationType: "table",
        movedToSchema: targetSchema,
        ...getOptionalSchemaEffect(match[2], "schemaName"),
        ...(match[1] ? { ifExists: true } : {}),
      }, match.index!);
    } else if (!sourceIsPublic && targetIsPublic && !match[1]) {
      add({
        kind: "relation",
        operation: "present",
        name: sourceName,
        relationType: "table",
        movedFromSchema: sourceSchema!,
        schemaName: "public",
      }, match.index!);
    }
  }
  const createIndexPattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?(?:(${sqlIdentifier})\s+)?ON\s+(?:ONLY\s+)?(${sqlQualifiedIdentifier})(?:\s+USING\s+(${sqlIdentifier}))?`, "giu");
  for (const match of sql.matchAll(createIndexPattern)) {
    const statementRange = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
    const statementEnd = statementRange?.end ?? sql.length;
    const remainderStart = match.index! + match[0].length;
    const remainder = sql.slice(remainderStart, statementEnd);
    const rawRemainder = sqlWithLiterals.slice(remainderStart, statementEnd);
    const predicateKeywordIndex = findTopLevelSqlKeywordIndex(remainder, "WHERE");
    const indexPredicateExpression = predicateKeywordIndex < 0
      ? null
      : rawRemainder.slice(predicateKeywordIndex + "WHERE".length).trim();
    const keyList = remainder.match(/^\s*\(([^()]*)\)/)?.[1] ?? null;
    const includeClause = remainder.match(/^\s*\([^()]*\)\s+INCLUDE\s*\(((?:"(?:[^"]|"")*"|[^)])*)\)/iu);
    const hasIncludeClause = /^\s*\([^()]*\)\s+INCLUDE\b/iu.test(remainder);
    const indexUnverifiedOptions = [
      ...(hasTopLevelSqlKeyword(remainder, "WITH") ? ["storage_parameters"] : []),
      ...(hasTopLevelSqlKeyword(remainder, "TABLESPACE") ? ["tablespace"] : []),
    ];
    add({
      kind: "index",
      operation: "present",
      name: match[3] ? cleanIdentifier(match[3]) : `__flyway_unnamed_index_${migration.version}_${match.index}`,
      tableName: cleanIdentifier(match[4]),
      ...getOptionalSchemaEffect(match[4], "tableSchemaName"),
      ...(match[2] ? { ifNotExists: true } : {}),
      indexColumns: keyList === null ? null : parseSimpleIndexColumns(keyList),
      indexKeyTerms: keyList === null ? null : parseFlywayIndexKeyTerms(keyList),
      indexIncludeColumns: hasIncludeClause
        ? includeClause ? parseSimpleIndexColumns(includeClause[1]) : null
        : [],
      ...(indexUnverifiedOptions.length > 0 ? { indexUnverifiedOptions } : {}),
      indexUnique: Boolean(match[1]),
      ...(Boolean(match[1]) && /^\s*\([^()]*\)(?:\s+INCLUDE\s*\([^()]*\))?\s+NULLS\s+NOT\s+DISTINCT\b/iu.test(remainder)
        ? { indexNullsNotDistinct: true }
        : {}),
      indexMethod: match[5]?.toLowerCase() ?? "btree",
      indexHasPredicate: hasTopLevelSqlKeyword(remainder, "WHERE"),
      indexPredicateExpression,
      ...(!match[3] ? { indexNameGenerated: true } : {}),
      ...(/\bON\s+ONLY\b/iu.test(match[0]) ? { indexOnly: true } : {}),
    }, match.index!);
  }
  const dropIndexStatementPattern = new RegExp(String.raw`^\s*DROP\s+INDEX\s+(CONCURRENTLY\s+)?(IF\s+EXISTS\s+)?(${sqlQualifiedIdentifier}(?:\s*,\s*${sqlQualifiedIdentifier})*)(?:\s+(CASCADE|RESTRICT))?\s*$`, "iu");
  for (const statementRange of statementRanges) {
    const statement = sql.slice(statementRange.start, statementRange.end);
    const match = dropIndexStatementPattern.exec(statement);
    if (!match) continue;
    const indexNames = splitSqlIdentifierList(match[3]);
    for (const indexName of indexNames) {
      add({
        kind: "index",
        operation: "absent",
        name: cleanIdentifier(indexName),
        ...getOptionalSchemaEffect(indexName, "schemaName"),
        ...(match[2] ? { ifExists: true } : {}),
        ...(match[1] ? { indexConcurrently: true } : {}),
        indexDropTargetCount: indexNames.length,
        statementStart: statementRange.start,
        ...(match[4]?.toUpperCase() === "CASCADE" ? { dropCascade: true } : {}),
        ...(match[1] && match[4]?.toUpperCase() === "CASCADE" ? { indexConcurrentDropCascadeUnsupported: true } : {}),
      }, statementRange.start + statement.indexOf(match[0]) + match[0].indexOf(indexName));
    }
  }
  const createSequencePattern = new RegExp(String.raw`${sqlIdentifierBoundary}CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`, "giu");
  for (const match of sql.matchAll(createSequencePattern)) {
    add({ kind: "sequence", operation: "present", name: cleanIdentifier(match[1]) }, match.index!);
  }
  const alterTablePattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(?:ONLY\s+)?(${sqlQualifiedIdentifier})([\s\S]*)`, "iu");
  const alterActionPattern = new RegExp(String.raw`${sqlIdentifierBoundary}(ADD\s+CONSTRAINT|DROP\s+CONSTRAINT|ADD(?:\s+COLUMN)?|DROP\s+COLUMN)\s+(?:(IF\s+(NOT\s+)?EXISTS)\s+)?(${sqlIdentifier})`, "giu");
  const alterColumnPattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER(?:\s+COLUMN)?\s+(${sqlIdentifier})\s+(?=(?:SET|DROP|TYPE|ADD|RESET|RESTART)${sqlIdentifierEnd})`, "giu");
  const alterConstraintPattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+CONSTRAINT\s+(${sqlIdentifier})`, "giu");
  const validateConstraintPattern = new RegExp(String.raw`${sqlIdentifierBoundary}VALIDATE\s+CONSTRAINT\s+(${sqlIdentifier})`, "giu");
  const renameColumnPattern = new RegExp(String.raw`${sqlIdentifierBoundary}RENAME(?:\s+COLUMN)?\s+(${sqlIdentifier})\s+TO\s+(${sqlIdentifier})`, "giu");
  const renameConstraintPattern = new RegExp(String.raw`${sqlIdentifierBoundary}RENAME\s+CONSTRAINT\s+(${sqlIdentifier})\s+TO\s+(${sqlIdentifier})`, "giu");
  for (const statementRange of statementRanges) {
    const statement = sql.slice(statementRange.start, statementRange.end);
    const alter = alterTablePattern.exec(statement);
    if (!alter) continue;
    const tableIfExists = Boolean(alter[1]);
    const tableName = cleanIdentifier(alter[2]);
    const body = alter[3];
    for (const match of body.matchAll(alterActionPattern)) {
      if (!isTopLevelSqlPosition(body, match.index!)) continue;
      const action = match[1].toUpperCase();
      if (action === "ADD" && /^(?:PRIMARY|UNIQUE)$/iu.test(match[4])) continue;
      const actionEnd = match.index! + match[0].length;
      const actionSegmentEnd = findNextTopLevelCommaIndex(body, actionEnd);
      const actionTail = body.slice(actionEnd, actionSegmentEnd);
      const isDropColumn = action === "DROP" || action === "DROP COLUMN";
      const dropCascade = action.startsWith("DROP") && hasTopLevelSqlKeyword(actionTail, "CASCADE");
      const uniqueConstraint = action === "ADD CONSTRAINT"
        ? findKeywordParenthesizedClause(actionTail, /^\s*(PRIMARY\s+KEY|UNIQUE(?:\s+NULLS\s+(NOT\s+)?DISTINCT)?)\s*/iu)
        : null;
      const uniqueInclude = uniqueConstraint ? findKeywordParenthesizedClause(actionTail, /^\s*INCLUDE\s*/iu) : null;
      const uniqueKeyColumns = uniqueConstraint ? parseSimpleIndexColumns(uniqueConstraint.content) : null;
      const uniqueIncludeColumns = uniqueInclude ? parseSimpleIndexColumns(uniqueInclude.content) : [];
      const deferrable = Boolean(uniqueConstraint && new RegExp(sqlKeywordPattern("DEFERRABLE"), "iu").test(actionTail)
        && !new RegExp(sqlKeywordPattern("NOT\\s+DEFERRABLE"), "iu").test(actionTail));
      const initiallyDeferred = Boolean(uniqueConstraint && new RegExp(sqlKeywordPattern("INITIALLY\\s+DEFERRED"), "iu").test(actionTail));
      const foreignKeyMatch = action === "ADD CONSTRAINT"
        ? new RegExp(String.raw`^\s*FOREIGN\s+KEY\s*\(((?:"(?:[^"]|"")*"|[^)])*)\)\s+REFERENCES\s+(${sqlQualifiedIdentifier})\s*(?:\(((?:"(?:[^"]|"")*"|[^)])*)\))?`, "iu")
          .exec(body.slice(match.index! + match[0].length))
        : null;
      const foreignKeyTargetParts = foreignKeyMatch ? splitQualifiedIdentifier(foreignKeyMatch[2]) : [];
      add({
        kind: action.includes("CONSTRAINT") ? "constraint" : "column",
        operation: action.startsWith("ADD") ? "present" : "absent",
        name: cleanIdentifier(match[4]),
        tableName,
        statementStart: statementRange.start,
        ...getOptionalSchemaEffect(alter[2], "tableSchemaName"),
        ifExists: Boolean(match[2]) && !match[3],
        ifNotExists: Boolean(match[3]),
        ...(isDropColumn ? { dropColumn: true } : {}),
        ...(dropCascade ? { dropCascade: true } : {}),
        ...(foreignKeyMatch ? {
          foreignKeyTarget: {
            localColumns: splitSqlIdentifierList(foreignKeyMatch[1]).map(cleanIdentifier),
            targetSchema: foreignKeyTargetParts.length > 1
              ? cleanIdentifier(foreignKeyTargetParts.at(-2)!)
              : null,
            targetTable: cleanIdentifier(foreignKeyMatch[2]),
            targetColumns: foreignKeyMatch[3] === undefined ? null : splitSqlIdentifierList(foreignKeyMatch[3]).map(cleanIdentifier),
          },
        } : {}),
        ...(uniqueConstraint && uniqueKeyColumns && uniqueIncludeColumns ? {
          uniqueKey: {
            columns: uniqueKeyColumns,
            primary: /^\s*PRIMARY\b/iu.test(uniqueConstraint.match[1]),
            deferrable,
            initiallyDeferred,
            nullsNotDistinct: Boolean(uniqueConstraint.match[2]),
            includeColumns: uniqueIncludeColumns,
          },
        } : {}),
        ...(uniqueConstraint && (!uniqueKeyColumns || !uniqueIncludeColumns) ? { uniqueKeyUnverified: true } : {}),
        ...(tableIfExists ? { tableIfExists: true } : {}),
      }, statementRange.start + alter[0].length - body.length + match.index!);
    }
    for (const match of body.matchAll(alterColumnPattern)) {
      if (!isTopLevelSqlPosition(body, match.index!)) continue;
      add({
        kind: "column",
        operation: "present",
        name: cleanIdentifier(match[1]),
        tableName,
        statementStart: statementRange.start,
        ...getOptionalSchemaEffect(alter[2], "tableSchemaName"),
        requiresExistingColumn: true,
        ...(tableIfExists ? { tableIfExists: true } : {}),
      }, statementRange.start + alter[0].length - body.length + match.index!);
    }
    for (const pattern of [alterConstraintPattern, validateConstraintPattern]) {
      for (const match of body.matchAll(pattern)) {
        if (!isTopLevelSqlPosition(body, match.index!)) continue;
        add({
          kind: "constraint",
          operation: "present",
          name: cleanIdentifier(match[1]),
          tableName,
          statementStart: statementRange.start,
          ...getOptionalSchemaEffect(alter[2], "tableSchemaName"),
          requiresExistingConstraint: true,
          ...(tableIfExists ? { tableIfExists: true } : {}),
        }, statementRange.start + alter[0].length - body.length + match.index!);
      }
    }
    for (const match of body.matchAll(renameColumnPattern)) {
      if (!isTopLevelSqlPosition(body, match.index!)) continue;
      const order = statementRange.start + alter[0].length - body.length + match.index!;
      const tableCondition = tableIfExists ? { tableIfExists: true } : {};
      add({ kind: "column", operation: "absent", name: cleanIdentifier(match[1]), tableName, statementStart: statementRange.start, ...getOptionalSchemaEffect(alter[2], "tableSchemaName"), ...tableCondition }, order);
      add({ kind: "column", operation: "present", name: cleanIdentifier(match[2]), tableName, statementStart: statementRange.start, ...getOptionalSchemaEffect(alter[2], "tableSchemaName"), ...tableCondition }, order + match[0].lastIndexOf(match[2]));
    }
    for (const match of body.matchAll(renameConstraintPattern)) {
      if (!isTopLevelSqlPosition(body, match.index!)) continue;
      const order = statementRange.start + alter[0].length - body.length + match.index!;
      const tableCondition = tableIfExists ? { tableIfExists: true } : {};
      add({ kind: "constraint", operation: "absent", name: cleanIdentifier(match[1]), tableName, statementStart: statementRange.start, renamedToConstraint: cleanIdentifier(match[2]), ...getOptionalSchemaEffect(alter[2], "tableSchemaName"), ...tableCondition }, order);
      add({ kind: "constraint", operation: "present", name: cleanIdentifier(match[2]), tableName, statementStart: statementRange.start, renamedFromConstraint: cleanIdentifier(match[1]), ...getOptionalSchemaEffect(alter[2], "tableSchemaName"), ...tableCondition }, order + match[0].lastIndexOf(match[2]));
    }
  }
  return orderedEffects.sort((left, right) => left.order - right.order).map(({ effect }) => effect);
}

export function hasFlywayConcurrentIndexOperation(migration: FlywayMigrationSql) {
  return parseFlywayDdlEffects(migration).some((effect) => effect.kind === "index" && effect.indexConcurrently);
}

export function hasExplicitNonTransactionalFlywayScriptConfig(config: string) {
  const settings = config.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => /^executeInTransaction\s*=/iu.test(line));
  return settings.length === 1 && /^executeInTransaction\s*=\s*false\s*$/iu.test(settings[0]);
}

export function findFlywayConcurrentIndexTransactionBlockStatementStarts(migration: FlywayMigrationSql) {
  const sql = maskSqlCommentsAndLiterals(migration.sql);
  const statementRanges = splitSqlStatementRanges(sql);
  const blockedStarts: number[] = [];
  let inExplicitTransaction = false;
  for (const range of statementRanges) {
    const statement = sql.slice(range.start, range.end);
    if (/^\s*(?:BEGIN|START\s+TRANSACTION)\b/iu.test(statement)) {
      inExplicitTransaction = true;
      continue;
    }
    if (inExplicitTransaction && /^\s*(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY)\b/iu.test(statement)) {
      blockedStarts.push(range.start);
      continue;
    }
    if (/^\s*(?:COMMIT|END|ROLLBACK|ABORT)\b/iu.test(statement)
      && !/^\s*ROLLBACK(?:\s+(?:WORK|TRANSACTION))?\s+TO\b/iu.test(statement)) {
      inExplicitTransaction = /\bAND\s+CHAIN\b/iu.test(statement);
    }
  }
  return blockedStarts;
}

export function findFlywaySchemaDropEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; schemaNames: string[]; ifExists: boolean; cascade: boolean }> = [];
  const dropSchemaPattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?(${sqlIdentifier})`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    const statementRanges = splitSqlStatementRanges(sql);
    for (const match of sql.matchAll(dropSchemaPattern)) {
      if (!isTopLevelSqlPosition(sql, match.index!)) continue;
      const range = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
      const statementEnd = range?.end ?? sql.length;
      const remainder = sql.slice(match.index! + match[0].length, statementEnd);
      const cascadeIndex = findTopLevelSqlKeywordIndex(remainder, "CASCADE");
      const restrictIndex = findTopLevelSqlKeywordIndex(remainder, "RESTRICT");
      const optionIndexes = [cascadeIndex, restrictIndex].filter((index) => index >= 0);
      const nameListEnd = optionIndexes.length > 0 ? Math.min(...optionIndexes) : remainder.length;
      const schemaNames = splitSqlIdentifierList(`${match[2]} ${remainder.slice(0, nameListEnd)}`)
        .map(cleanIdentifier)
        .filter(Boolean);
      effects.push({
        version: migration.version,
        filename: migration.filename,
        schemaNames,
        ifExists: Boolean(match[1]),
        cascade: cascadeIndex >= 0,
      });
    }
  }
  return effects;
}

export function findFlywaySchemaRenameEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; sourceSchema: string; targetSchema: string }> = [];
  const renameSchemaPattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+SCHEMA\s+(${sqlIdentifier})\s+RENAME\s+TO\s+(${sqlIdentifier})`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    for (const match of sql.matchAll(renameSchemaPattern)) {
      if (!isTopLevelSqlPosition(sql, match.index!)) continue;
      effects.push({
        version: migration.version,
        filename: migration.filename,
        sourceSchema: cleanIdentifier(match[1]),
        targetSchema: cleanIdentifier(match[2]),
      });
    }
  }
  return effects;
}

export function findFlywayTypeCascadeDropEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; typeNames: string[]; ifExists: boolean }> = [];
  const dropTypePattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+TYPE\s+(IF\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    const statementRanges = splitSqlStatementRanges(sql);
    for (const match of sql.matchAll(dropTypePattern)) {
      if (!isTopLevelSqlPosition(sql, match.index!)) continue;
      const range = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
      const statementEnd = range?.end ?? sql.length;
      const remainder = sql.slice(match.index! + match[0].length, statementEnd);
      const cascadeIndex = findTopLevelSqlKeywordIndex(remainder, "CASCADE");
      if (cascadeIndex < 0) continue;
      const restrictIndex = findTopLevelSqlKeywordIndex(remainder, "RESTRICT");
      const nameListEnd = restrictIndex >= 0 && restrictIndex < cascadeIndex ? restrictIndex : cascadeIndex;
      const typeNames = splitSqlIdentifierList(`${match[2]} ${remainder.slice(0, nameListEnd)}`)
        .map(cleanIdentifier)
        .filter(Boolean);
      effects.push({ version: migration.version, filename: migration.filename, typeNames, ifExists: Boolean(match[1]) });
    }
  }
  return effects;
}

export function findFlywayDomainCascadeDropEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; domainNames: string[]; ifExists: boolean }> = [];
  const dropDomainPattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+DOMAIN\s+(IF\s+EXISTS\s+)?(${sqlQualifiedIdentifier})`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    const statementRanges = splitSqlStatementRanges(sql);
    for (const match of sql.matchAll(dropDomainPattern)) {
      if (!isTopLevelSqlPosition(sql, match.index!)) continue;
      const range = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
      const statementEnd = range?.end ?? sql.length;
      const remainder = sql.slice(match.index! + match[0].length, statementEnd);
      const cascadeIndex = findTopLevelSqlKeywordIndex(remainder, "CASCADE");
      if (cascadeIndex < 0) continue;
      const restrictIndex = findTopLevelSqlKeywordIndex(remainder, "RESTRICT");
      const nameListEnd = restrictIndex >= 0 && restrictIndex < cascadeIndex ? restrictIndex : cascadeIndex;
      const domainNames = splitSqlIdentifierList(`${match[2]} ${remainder.slice(0, nameListEnd)}`)
        .map(cleanIdentifier)
        .filter(Boolean);
      effects.push({ version: migration.version, filename: migration.filename, domainNames, ifExists: Boolean(match[1]) });
    }
  }
  return effects;
}

export function findFlywayDropOwnedEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; roleNames: string[]; cascade: boolean }> = [];
  const dropOwnedPattern = new RegExp(String.raw`${sqlIdentifierBoundary}DROP\s+OWNED\s+BY\s+(${sqlIdentifier}|CURRENT_ROLE|CURRENT_USER|SESSION_USER)`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    const statementRanges = splitSqlStatementRanges(sql);
    for (const match of sql.matchAll(dropOwnedPattern)) {
      if (!isTopLevelSqlPosition(sql, match.index!)) continue;
      const range = statementRanges.find(({ start, end }) => match.index! >= start && match.index! < end);
      const statementEnd = range?.end ?? sql.length;
      const remainder = sql.slice(match.index! + match[0].length, statementEnd);
      const cascadeIndex = findTopLevelSqlKeywordIndex(remainder, "CASCADE");
      const restrictIndex = findTopLevelSqlKeywordIndex(remainder, "RESTRICT");
      const optionIndexes = [cascadeIndex, restrictIndex].filter((index) => index >= 0);
      const roleListEnd = optionIndexes.length > 0 ? Math.min(...optionIndexes) : remainder.length;
      const roleNames = splitSqlIdentifierList(`${match[1]} ${remainder.slice(0, roleListEnd)}`)
        .map(cleanIdentifier)
        .filter(Boolean);
      effects.push({ version: migration.version, filename: migration.filename, roleNames, cascade: cascadeIndex >= 0 });
    }
  }
  return effects;
}

export function findFlywayUnmodeledAlterUniqueKeyEffects(migrations: FlywayMigrationSql[]) {
  const effects: Array<{ version: string; filename: string; tableName: string; form: "anonymous_constraint" | "using_index"; constraintName: string | null; indexName: string | null }> = [];
  const alterTablePattern = new RegExp(String.raw`${sqlIdentifierBoundary}ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${sqlQualifiedIdentifier})([\s\S]*)`, "iu");
  const anonymousUniquePattern = new RegExp(String.raw`${sqlIdentifierBoundary}ADD\s+(PRIMARY\s+KEY|UNIQUE(?:\s+NULLS\s+(?:NOT\s+)?DISTINCT)?)\s*\(`, "giu");
  const usingIndexPattern = new RegExp(String.raw`${sqlIdentifierBoundary}ADD\s+CONSTRAINT\s+(${sqlIdentifier})\s+(PRIMARY\s+KEY|UNIQUE(?:\s+NULLS\s+(?:NOT\s+)?DISTINCT)?)\s+USING\s+INDEX\s+(${sqlIdentifier})`, "giu");
  for (const migration of migrations) {
    const sql = maskSqlCommentsAndLiterals(migration.sql);
    const statementRanges = splitSqlStatementRanges(sql);
    for (const statementRange of statementRanges) {
      const statement = sql.slice(statementRange.start, statementRange.end);
      const alter = alterTablePattern.exec(statement);
      if (!alter) continue;
      const tableName = cleanIdentifier(alter[1]);
      const body = alter[2];
      for (const match of body.matchAll(anonymousUniquePattern)) {
        if (!isTopLevelSqlPosition(body, match.index!)) continue;
        effects.push({ version: migration.version, filename: migration.filename, tableName, form: "anonymous_constraint", constraintName: null, indexName: null });
      }
      for (const match of body.matchAll(usingIndexPattern)) {
        if (!isTopLevelSqlPosition(body, match.index!)) continue;
        effects.push({ version: migration.version, filename: migration.filename, tableName, form: "using_index", constraintName: cleanIdentifier(match[1]), indexName: cleanIdentifier(match[3]) });
      }
    }
  }
  return effects;
}

export function auditFlywayIndexTargetsAgainstSourceHistory(migrations: FlywayMigrationSql[]) {
  const droppedRelations = new Map<string, { version: string; filename: string }>();
  const issues: Array<{
    version: string;
    filename: string;
    indexName: string;
    targetTable: string;
    droppedInVersion: string;
    droppedInFilename: string;
  }> = [];

  for (const migration of [...migrations].sort((left, right) => compareVersion(left.version, right.version))) {
    for (const effect of parseFlywayDdlEffects(migration)) {
      if (effect.kind === "relation") {
        if (effect.schemaName && effect.schemaName !== "public") continue;
        if (effect.renamedToRelation) {
          droppedRelations.set(effect.name, { version: migration.version, filename: migration.filename });
          droppedRelations.delete(effect.renamedToRelation);
        } else if (effect.operation === "absent") {
          droppedRelations.set(effect.name, { version: migration.version, filename: migration.filename });
        } else {
          droppedRelations.delete(effect.name);
        }
        continue;
      }
      if (effect.kind !== "index" || effect.operation !== "present" || !effect.tableName) continue;
      if (effect.tableSchemaName && effect.tableSchemaName !== "public") continue;
      const droppedIn = droppedRelations.get(effect.tableName);
      if (!droppedIn) continue;
      issues.push({
        version: migration.version,
        filename: migration.filename,
        indexName: effect.name,
        targetTable: effect.tableName,
        droppedInVersion: droppedIn.version,
        droppedInFilename: droppedIn.filename,
      });
    }
  }
  return issues;
}

export function findFlywayRelationCreationSourceBeforeVersion(
  migrations: FlywayMigrationSql[],
  relationName: string,
  beforeVersion: string,
) {
  const relationSources = new Map<string, { version: string; filename: string; relationType: "table" | "view" | "materialized_view" }>();
  for (const migration of [...migrations].sort((left, right) => compareVersion(left.version, right.version))) {
    if (compareVersion(migration.version, beforeVersion) >= 0) break;
    for (const effect of parseFlywayDdlEffects(migration)) {
      if (effect.kind !== "relation") continue;
      if (effect.schemaName && effect.schemaName !== "public") continue;
      if (effect.renamedToRelation) {
        const source = relationSources.get(effect.name);
        relationSources.delete(effect.name);
        if (source) relationSources.set(effect.renamedToRelation, { ...source, version: migration.version, filename: migration.filename });
      } else if (effect.operation === "absent") {
        relationSources.delete(effect.name);
      } else if (effect.relationType === "table" || effect.relationType === "view" || effect.relationType === "materialized_view") {
        relationSources.set(effect.name, { version: migration.version, filename: migration.filename, relationType: effect.relationType });
      }
    }
  }
  return relationSources.get(relationName) ?? null;
}

/**
 * Compares final source-declared object presence with PostgreSQL catalogs.
 * This is a heuristic DDL inventory only; it cannot prove checksums, full
 * column/constraint/index definitions, index validity, or data backfill
 * correctness. It recognizes named ALTER TABLE ADD/DROP/RENAME constraint
 * effects, not inline constraints in CREATE TABLE.
 */
export function auditFlywayDdlInventory(migrations: FlywayMigrationSql[], catalog: FlywayCatalogSnapshot) {
  const finalEffects = new Map<string, DdlEffect>();
  const dataOperations: Array<{ version: string; filename: string; operation: string; tableName: string }> = [];

  for (const migration of migrations) {
    for (const effect of parseFlywayDdlEffects(migration)) {
      const key = `${effect.kind}:${effect.tableName ?? ""}:${effect.name}`;
      finalEffects.set(key, effect);
    }
    const uncommentedSql = maskSqlCommentsAndLiterals(migration.sql);
    const dataOperationPattern = new RegExp(String.raw`${sqlIdentifierBoundary}(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+(?:ONLY\s+)?(${sqlQualifiedIdentifier})`, "giu");
    for (const match of uncommentedSql.matchAll(dataOperationPattern)) {
      if (match[1].toUpperCase() === "UPDATE" && /^(?:SET|FROM|WHERE|RETURNING|OR|OF)$/i.test(match[2])) continue;
      dataOperations.push({ version: migration.version, filename: migration.filename, operation: match[1].replace(/\s+/g, " ").toUpperCase(), tableName: cleanIdentifier(match[2]) });
    }
  }

  const relationMap = new Map(catalog.relations.map((relation) => [relation.name, relation.kind]));
  const columnSet = new Set(catalog.columns.map(({ tableName, columnName }) => `${tableName}.${columnName}`));
  const constraintSet = new Set(catalog.constraints.map(({ tableName, name }) => `${tableName}.${name}`));
  const skippedParentAbsentObjects: DdlEffect[] = [];
  const effectsToCheck = [...finalEffects.values()].filter((effect) => {
    if (!effect.tableName || !["column", "constraint", "index"].includes(effect.kind)) return true;
    const parentRelation = finalEffects.get(`relation::${effect.tableName}`);
    if (effect.tableIfExists && !relationMap.has(effect.tableName) && parentRelation?.operation !== "present") {
      skippedParentAbsentObjects.push(effect);
      return false;
    }
    if (parentRelation?.operation !== "absent"
      && !(parentRelation?.operation === "present" && parentRelation.relationType === "view" && ["constraint", "index"].includes(effect.kind))) return true;
    skippedParentAbsentObjects.push(effect);
    return false;
  });
  const objectChecks = effectsToCheck.map((effect) => {
    const conditionalRenameNoOp = effect.conditionalSourceRelation !== undefined
      && !relationMap.has(effect.conditionalSourceRelation)
      && !relationMap.has(effect.name);
    let actualPresent = false;
    let actualKind: string | null = null;
    if (effect.kind === "relation") {
      actualKind = relationMap.get(effect.name) ?? null;
      actualPresent = actualKind !== null;
      if (actualPresent && effect.relationType === "table") actualPresent = actualKind === "r" || actualKind === "p";
      if (actualPresent && effect.relationType === "view") actualPresent = actualKind === "v" || actualKind === "m";
      if (actualPresent && effect.relationType === "materialized_view") actualPresent = actualKind === "m";
    } else if (effect.kind === "column") actualPresent = columnSet.has(`${effect.tableName}.${effect.name}`);
    else if (effect.kind === "constraint") actualPresent = constraintSet.has(`${effect.tableName}.${effect.name}`);
    else {
      actualKind = relationMap.get(effect.name) ?? null;
      actualPresent = effect.kind === "index" ? actualKind === "i" || actualKind === "I" : actualKind === "S";
    }
    const expectedPresent = effect.operation === "present" && !conditionalRenameNoOp;
    return {
      kind: effect.kind,
      name: effect.name,
      tableName: effect.tableName ?? null,
      expectedPresent,
      actualPresent,
      actualKind,
      matches: actualPresent === expectedPresent,
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
    skippedParentAbsentObjectCount: skippedParentAbsentObjects.length,
    skippedParentAbsentObjects: skippedParentAbsentObjects.map(({ kind, name, tableName, version, filename }) => ({ kind, name, tableName, declaredBy: { version, filename } })),
    unverifiedDataOperationCount: dataOperations.length,
    dataOperationsByMigration: [...dataByMigration.values()],
    dataOperationNote: "Detected DML operation starts outside dollar-quoted DO blocks are heuristic candidates only; this list excludes procedural/dynamic SQL and does not prove a complete inventory or verify whether changes succeeded or produced correct data.",
    note: "Object presence is heuristic only; column, constraint, and index checks whose final source parent relation is dropped or renamed away are counted as skipped, as are constraints/indexes attached to a final regular view. inline CREATE TABLE constraints are not inventoried, and this does not verify Flyway checksums, full column/constraint/index definitions, valid indexes, or data-operation results.",
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
  const appliedVersions = [...successfulVersions].sort(compareVersion);
  const sourceVersions = migrations.map((migration) => migration.version);
  const appliedLatest = appliedVersions.at(-1) ?? null;
  const unapplied = migrations.filter((migration) => !successfulVersions.has(migration.version));
  const pending = unapplied.filter((migration) => !appliedLatest || compareVersion(migration.version, appliedLatest) > 0);
  const olderUnapplied = unapplied.filter((migration) => appliedLatest && compareVersion(migration.version, appliedLatest) < 0);
  const failed = history.filter((row) => !row.success);
  return {
    appliedLatest,
    sourceLatest: sourceVersions.at(-1) ?? null,
    appliedMigrationCount: successfulVersions.size,
    sourceMigrationCount: migrations.length,
    pending,
    olderUnapplied,
    failed,
    drift: pending.length > 0 || failed.length > 0,
  };
}

export function calculateFlywaySqlChecksum(sql: string) {
  const lineContent = sql.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).join("");
  let checksum = 0xffffffff;
  for (const byte of Buffer.from(lineContent, "utf8")) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) | 0;
}

export function auditAppliedFlywayMigrationValidation(history: FlywayHistoryRecord[], migrations: FlywayMigrationSql[]) {
  const sourceByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const sourceCounts = new Map<string, number>();
  for (const migration of migrations) sourceCounts.set(migration.version, (sourceCounts.get(migration.version) ?? 0) + 1);
  const duplicateSourceIssues = [...sourceCounts]
    .filter(([, count]) => count > 1)
    .map(([version, count]) => ({ version, reason: "DUPLICATE_SOURCE_MIGRATION_VERSION", appliedScript: null, expected: 1, actual: count }));
  const historyIssues = history.flatMap((row) => {
    if (!row.success || !row.version || row.type?.toUpperCase() === "BASELINE") return [];
    if (row.type?.toUpperCase() !== "SQL") {
      return [{ version: row.version, reason: "APPLIED_MIGRATION_TYPE_UNSUPPORTED", appliedScript: row.script ?? null, expected: "SQL or BASELINE", actual: row.type ?? null }];
    }
    const source = sourceByVersion.get(row.version);
    if (!source) return [{ version: row.version, reason: "APPLIED_MIGRATION_NOT_RESOLVED", appliedScript: row.script ?? null }];

    const filenameMatch = source.filename.match(/^V[0-9]+(?:\.[0-9]+)*__([^.]+)\.sql$/i);
    const expectedDescription = filenameMatch?.[1].replaceAll("_", " ").toLowerCase() ?? null;
    const actualDescription = row.description?.toLowerCase() ?? null;
    const expectedChecksum = calculateFlywaySqlChecksum(source.sql);
    const validationIssues: Array<{ version: string; reason: string; appliedScript: string | null; expected?: string | number | null; actual?: string | number | null }> = [];
    if (expectedDescription === null || actualDescription !== expectedDescription) {
      validationIssues.push({ version: row.version, reason: "DESCRIPTION_MISMATCH", appliedScript: row.script ?? null, expected: expectedDescription, actual: actualDescription });
    }
    if (row.type?.toUpperCase() !== "SQL") {
      validationIssues.push({ version: row.version, reason: "TYPE_MISMATCH", appliedScript: row.script ?? null, expected: "SQL", actual: row.type ?? null });
    }
    if (row.checksum === null || row.checksum === undefined || row.checksum !== expectedChecksum) {
      validationIssues.push({ version: row.version, reason: row.checksum === null || row.checksum === undefined ? "CHECKSUM_MISSING" : "CHECKSUM_MISMATCH", appliedScript: row.script ?? null, expected: expectedChecksum, actual: row.checksum ?? null });
    }
    return validationIssues;
  });
  const issues = [...duplicateSourceIssues, ...historyIssues];
  const checkedAppliedVersions = new Set(history
    .filter((row) => row.success && row.version && row.type?.toUpperCase() === "SQL")
    .map((row) => row.version!));
  return {
    ok: issues.length === 0,
    checkedAppliedMigrationCount: checkedAppliedVersions.size,
    issues,
  };
}

export type FlywayMigrationState = "APPLIED" | "FAILED" | "APPLIED_WITH_FAILED_ATTEMPTS" | "PENDING" | "OLDER_UNAPPLIED" | "NOT_IN_HISTORY";

export function classifyFlywayMigrationState(
  version: string,
  history: FlywayHistoryRecord[],
  pending: FlywayMigrationFile[],
  olderUnapplied: FlywayMigrationFile[],
): FlywayMigrationState {
  const rows = history.filter((row) => row.version === version);
  const hasSuccessfulRow = rows.some((row) => row.success);
  const hasFailedRow = rows.some((row) => !row.success);
  if (hasSuccessfulRow && hasFailedRow) return "APPLIED_WITH_FAILED_ATTEMPTS";
  if (hasSuccessfulRow) return "APPLIED";
  if (hasFailedRow) return "FAILED";
  if (pending.some((migration) => migration.version === version)) return "PENDING";
  if (olderUnapplied.some((migration) => migration.version === version)) return "OLDER_UNAPPLIED";
  return "NOT_IN_HISTORY";
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
    const postMigrationShapePresent = source?.relationKind === "v"
      && isPhysicalTable(candles)
      && isPhysicalTable(common)
      && isPhysicalTable(special)
      && (market !== "us" || isPhysicalTable(legacyRenameTarget ?? undefined));

    return {
      market,
      source: { name: sourceName, kind: source?.relationKind ?? null, estimatedRows: source?.estimatedRows ?? null, physicalTable: isPhysicalTable(source) },
      candles: { name: candlesName, kind: candles?.relationKind ?? null, estimatedRows: candles?.estimatedRows ?? null, physicalTable: isPhysicalTable(candles) },
      destinations: [commonName, specialName].map((name) => ({ name, exists: Boolean(byName.get(name)?.relationKind) })),
      ...(market === "us" ? { renameTarget: { name: "us_instrument_universe_legacy", exists: Boolean(legacyRenameTarget?.relationKind) } } : {}),
      postMigrationShapePresent,
      postMigrationShapeNote: "Relation kinds and presence only; this does not verify migration history, row contents, filters, constraints, or data-loss impact.",
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
