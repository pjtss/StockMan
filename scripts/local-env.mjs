import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function parseLocalEnv(contents) {
  const values = {};
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const rawValue = match[2].trim();
    const quotedValue = rawValue.match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
    let value;
    if (quotedValue) {
      value = quotedValue[2];
    } else {
      value = rawValue.replace(/\s+#.*$/, "").trim();
    }
    values[match[1]] = value.replace(/\\n/g, "\n");
  }
  return values;
}

export function readLocalEnvFile(filePath = resolve(process.cwd(), ".env.local"), { required = false } = {}) {
  if (!existsSync(filePath)) {
    if (required) throw new Error(`Required local env file not found: ${filePath}`);
    return {};
  }
  return parseLocalEnv(readFileSync(filePath, "utf8"));
}

/** `.env.local` wins over inherited shell values unless explicitly disabled. */
export function loadLocalEnv({ filePath, required = false, override = true, target = process.env } = {}) {
  const values = readLocalEnvFile(filePath, { required });
  for (const [key, value] of Object.entries(values)) {
    if (override || !(key in target)) target[key] = value;
  }
  return values;
}
