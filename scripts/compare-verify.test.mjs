import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts", "compare-verify.mjs");
const tempDirectories = [];

function writeResult(directory, name, gitHead) {
  const result = {
    ok: true,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpuCount: 8 },
    metadata: { generatedAt: "2026-09-13T00:00:00.000Z", gitHead, workingTreeDirty: false },
    stages: [{ name: "test", status: "passed", durationMs: 100 }],
  };
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(result)}\n`);
  return path;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("verify comparison metadata", () => {
  it("keeps high confidence for the same commit", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-compare-"));
    tempDirectories.push(directory);
    const baseline = writeResult(directory, "baseline.json", "same-commit");
    const current = writeResult(directory, "current.json", "same-commit");
    const result = spawnSync(process.execPath, [scriptPath, baseline, current], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")).trim());
    expect(output).toMatchObject({ ok: true, codeStatus: "MATCH", confidence: "HIGH", scopeStatus: "APPROVED" });
  });

  it("lowers confidence when commits differ without masking stage results", () => {
    const directory = mkdtempSync(join(tmpdir(), "stockman-compare-"));
    tempDirectories.push(directory);
    const baseline = writeResult(directory, "baseline.json", "old-commit");
    const current = writeResult(directory, "current.json", "new-commit");
    const result = spawnSync(process.execPath, [scriptPath, baseline, current], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")).trim());
    expect(output).toMatchObject({ ok: true, codeStatus: "CODE_MISMATCH", codeDifference: true, confidence: "LOW", scopeStatus: "APPROVED" });
  });
});
