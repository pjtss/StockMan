import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const invalidBearerWhitespace = String.raw`Bearer\\s`;

export function findDoubleEscapedBearerParsers(files) {
  return files
    .filter(({ content }) => content.includes(invalidBearerWhitespace))
    .map(({ file }) => file);
}

function collectApiRoutes(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectApiRoutes(fullPath, root);
    if (!entry.isFile() || !/^route\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    return [{ file: path.relative(root, fullPath), content: readFileSync(fullPath, "utf8") }];
  });
}

export function auditBearerAuth(root = process.cwd()) {
  const routes = collectApiRoutes(path.join(root, "app", "api"));
  const invalid = findDoubleEscapedBearerParsers(routes);
  if (invalid.length) {
    console.error(`Invalid double-escaped Bearer whitespace parser:\n${invalid.map((file) => `- ${file}`).join("\n")}`);
    return false;
  }
  console.log(`Bearer auth source audit OK (${routes.length} API routes).`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!auditBearerAuth()) process.exitCode = 1;
}
