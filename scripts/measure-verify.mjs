import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = [
  ["test", ["test", "--", "--run"]],
  ["typecheck", ["run", "typecheck"]],
  ["docs", ["run", "docs:check"]],
  ["verifyScope", ["run", "audit:verify-scope"]],
  ["kisBoundary", ["run", "audit:kis-boundary"]],
  ["cron", ["run", "cron:check"]],
  ["build", ["run", "build"]],
];
const startedAt = Date.now();
const results = [];
const outputIndex = process.argv.indexOf("--out");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputPath) {
  console.error("measure:verify requires a file path after --out");
  process.exit(2);
}
function emit(result) {
  const serialized = JSON.stringify(result, null, 2);
  if (outputPath) writeFileSync(outputPath, `${serialized}\n`, "utf8");
  console.log(serialized);
}
function gitValue(args, fallback) {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback; } catch { return fallback; }
}
const environment = { node: process.version, platform: process.platform, arch: process.arch, cpuCount: os.cpus().length };
const metadata = {
  generatedAt: new Date().toISOString(),
  gitHead: gitValue(["rev-parse", "HEAD"], "UNKNOWN"),
  workingTreeDirty: Boolean(gitValue(["status", "--porcelain"], "")),
};
for (const [name, args] of stages) {
  const stageStartedAt = Date.now();
  try {
    const command = process.platform === "win32" ? process.env.ComSpec : npm;
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", [npm, ...args].join(" ")] : args;
    const result = spawnSync(command, commandArgs, { stdio: "inherit", env: process.env, shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(`stage exited with status ${result.status}`);
      error.status = result.status ?? 1;
      throw error;
    }
    results.push({ name, status: "passed", durationMs: Date.now() - stageStartedAt });
  } catch (error) {
    results.push({ name, status: "failed", durationMs: Date.now() - stageStartedAt });
    emit({ ok: false, environment, metadata, totalDurationMs: Date.now() - startedAt, stages: results });
    process.exit(typeof error?.status === "number" ? error.status : 1);
  }
}
emit({ ok: true, environment, metadata, totalDurationMs: Date.now() - startedAt, stages: results });
