import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts", "audit-verify-scope-change.mjs");
const tempDirectories = [];

function createRepo(manifest) {
  const directory = mkdtempSync(join(tmpdir(), "stockman-verify-scope-"));
  tempDirectories.push(directory);
  execFileSync("git", ["-c", "core.autocrlf=false", "init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
  writeFileSync(join(directory, "config-placeholder"), "test\n");
  mkdirSync(join(directory, "config"));
  writeFileSync(join(directory, "config", "verify-scope.json"), manifest);
  execFileSync("git", ["-c", "core.autocrlf=false", "add", "."], { cwd: directory });
  execFileSync("git", ["-c", "core.autocrlf=false", "commit", "--quiet", "-m", "baseline"], { cwd: directory });
  return directory;
}

const validManifest = JSON.stringify({
  version: 1,
  changeReason: "test change",
  approvedBy: "test",
  approvedAt: "2026-09-13",
  approvedStages: ["test"],
}, null, 2);

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("verify scope change audit", () => {
  it("accepts a new manifest with approval metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-verify-scope-new-"));
    tempDirectories.push(directory);
    execFileSync("git", ["-c", "core.autocrlf=false", "init", "--quiet"], { cwd: directory });
    writeFileSync(join(directory, "config-placeholder"), "test\n");
    execFileSync("git", ["-c", "core.autocrlf=false", "add", "."], { cwd: directory });
    execFileSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: directory, env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" } });
    writeFileSync(join(directory, "config-placeholder"), "test\n");
    mkdirSync(join(directory, "config"));
    writeFileSync(join(directory, "config", "verify-scope.json"), validManifest);
    const result = spawnSync(process.execPath, [scriptPath], { cwd: directory, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("new manifest includes approval metadata");
  });

  it("rejects a new manifest without approval metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-verify-scope-invalid-"));
    tempDirectories.push(directory);
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    writeFileSync(join(directory, "config-placeholder"), "test\n");
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "baseline"], { cwd: directory });
    mkdirSync(join(directory, "config"));
    writeFileSync(join(directory, "config", "verify-scope.json"), JSON.stringify({ version: 1 }));
    const result = spawnSync(process.execPath, [scriptPath], { cwd: directory, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing approval metadata");
  });

  it("rejects a tracked change that omits approval metadata in the diff", () => {
    const directory = createRepo(validManifest);
    const changed = JSON.parse(readFileSync(join(directory, "config", "verify-scope.json"), "utf8"));
    delete changed.approvedAt;
    writeFileSync(join(directory, "config", "verify-scope.json"), JSON.stringify(changed, null, 2));
    const result = spawnSync(process.execPath, [scriptPath], { cwd: directory, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("approvedAt");
  });
});
