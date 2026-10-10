import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv, parseLocalEnv, readLocalEnvFile } from "./local-env.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("local env configuration", () => {
  it("parses exports, quoted values, inline comments, duplicate keys, and escaped newlines", () => {
    expect(parseLocalEnv([
      "# ignored",
      "export DATABASE_URL = postgres://local/db # local only",
      "KIS_APPKEY='quoted # value'",
      "PASSWORD=\"quoted value\" # trailing comment",
      "MULTILINE=first\\nsecond",
      "DATABASE_URL=postgres://override/db",
      "invalid line",
    ].join("\n"))).toEqual({
      DATABASE_URL: "postgres://override/db",
      KIS_APPKEY: "quoted # value",
      PASSWORD: "quoted value",
      MULTILINE: "first\nsecond",
    });
  });

  it("lets the local file override inherited values by default", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-env-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, ".env.local");
    writeFileSync(filePath, "DATABASE_URL=postgres://local/db\nNEW_VALUE=from-file\n", "utf8");
    const target = { DATABASE_URL: "postgres://shell/db", KEEP: "shell" };

    loadLocalEnv({ filePath, target });

    expect(target).toEqual({ DATABASE_URL: "postgres://local/db", NEW_VALUE: "from-file", KEEP: "shell" });
    expect(readLocalEnvFile(filePath)).toEqual({ DATABASE_URL: "postgres://local/db", NEW_VALUE: "from-file" });
  });

  it("can preserve inherited values for callers that explicitly request it", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-env-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, ".env.local");
    writeFileSync(filePath, "DATABASE_URL=postgres://local/db\n", "utf8");
    const target = { DATABASE_URL: "postgres://shell/db" };

    loadLocalEnv({ filePath, target, override: false });

    expect(target.DATABASE_URL).toBe("postgres://shell/db");
  });
});
