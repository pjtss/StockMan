import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "docs/README.md",
  "docs/architecture/code-structure.md",
  "docs/development/conventions.md",
  "docs/operations/runbook.md",
  "docs/references/README.md",
  "app/README.md",
  "lib/README.md",
  "db/README.md",
  "scripts/README.md",
];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error(`Missing required documentation: ${missing.join(", ")}`);
  process.exit(1);
}

const migrationDir = join(root, "db", "migration");
const migrations = readdirSync(migrationDir).filter((file) => /^V\d+__.+\.sql$/.test(file));
const versions = migrations.map((file) => Number(file.match(/^V(\d+)/)?.[1])).sort((a, b) => a - b);
const duplicateVersions = versions.filter((version, index) => versions.indexOf(version) !== index);
if (duplicateVersions.length) {
  console.error(`Duplicate migration versions: ${[...new Set(duplicateVersions)].join(", ")}`);
  process.exit(1);
}

const malformed = readdirSync(migrationDir).filter((file) => file.endsWith(".sql") && !/^V\d+__.+\.sql$/.test(file));
if (malformed.length) {
  console.error(`Malformed migration filenames: ${malformed.join(", ")}`);
  process.exit(1);
}
console.log(`Documentation OK (${required.length} entry points); migrations OK (${versions.length} files, latest V${versions.at(-1) ?? 0}).`);
