import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const invalidBearerWhitespace = String.raw`Bearer\\s`;
const cronSecretConfigOnlyRoutes = new Set(["admin/market-debug/route.ts"]);

export function findDoubleEscapedBearerParsers(files) {
  return files
    .filter(({ content }) => content.includes(invalidBearerWhitespace))
    .map(({ file }) => file);
}

export function findNonCentralizedCronSecretRoutes(files) {
  return files
    .filter(({ file, content }) => content.includes("CRON_SECRET")
      && !content.includes("isCronRequestAuthorized(request)")
      && !cronSecretConfigOnlyRoutes.has(file.replaceAll("\\", "/")))
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
  const nonCentralizedCronAuth = findNonCentralizedCronSecretRoutes(routes);
  if (invalid.length) {
    console.error(`Invalid double-escaped Bearer whitespace parser:\n${invalid.map((file) => `- ${file}`).join("\n")}`);
    return false;
  }
  if (nonCentralizedCronAuth.length) {
    console.error(`CRON_SECRET routes must use the shared request authenticator:\n${nonCentralizedCronAuth.map((file) => `- ${file}`).join("\n")}`);
    return false;
  }
  console.log(`Auth source audit OK (${routes.length} API routes; cron auth centralized).`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!auditBearerAuth()) process.exitCode = 1;
}
