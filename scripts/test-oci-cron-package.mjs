import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const bashCandidates = process.platform === "win32"
  ? [process.env.BASH, "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
  : ["bash"];
const bash = bashCandidates.find((candidate) => candidate && (path.isAbsolute(candidate) ? existsSync(candidate) : true));
if (!bash) throw new Error("Bash is required to verify the OCI cron package");

function shellPath(value) {
  let resolved = path.resolve(value).replaceAll("\\", "/");
  if (process.platform === "win32") resolved = resolved.replace(/^([A-Za-z]):\/(.*)$/, (_, drive, rest) => `/${drive.toLowerCase()}/${rest}`);
  return resolved.replaceAll("'", "'\\''");
}

function runBash(args, options = {}) {
  const result = spawnSync(bash, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Bash package smoke failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "stockman-cron-package-"));
const tempRootResolved = path.resolve(tempRoot);
const tempBaseResolved = path.resolve(os.tmpdir());
const tempRelativePath = path.relative(tempBaseResolved, tempRootResolved);
const tempRootIsContained = tempRelativePath !== "" && tempRelativePath !== ".." && !tempRelativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(tempRelativePath);

try {
  if (!tempRootIsContained) throw new Error("Refusing to use a package smoke directory outside the OS temp directory");
  const releaseDir = path.join(tempRootResolved, "standalone");
  const unpackDir = path.join(tempRootResolved, "unpacked");
  mkdirSync(path.join(releaseDir, "scripts"), { recursive: true });
  mkdirSync(unpackDir, { recursive: true });
  for (const filename of ["oci-cron.sh", "cron-response-classifier.sh", "oci-fundamentals-cron.sh", "oci-rss-cron.sh"]) {
    cpSync(path.resolve("scripts", filename), path.join(releaseDir, "scripts", filename));
  }
  const executablePaths = ["oci-cron.sh", "oci-fundamentals-cron.sh", "oci-rss-cron.sh"]
    .map((filename) => `'${shellPath(path.join(releaseDir, "scripts", filename))}'`)
    .join(" ");
  runBash(["-lc", `chmod +x ${executablePaths}`]);

  const archive = path.join(tempRootResolved, "release.tar.gz");
  runBash(["-lc", `tar -czf '${shellPath(archive)}' -C '${shellPath(releaseDir)}' .`]);
  const entries = runBash(["-lc", `tar -tzf '${shellPath(archive)}'`]);
  for (const requiredEntry of ["./scripts/oci-cron.sh", "./scripts/cron-response-classifier.sh", "./scripts/oci-fundamentals-cron.sh", "./scripts/oci-rss-cron.sh"]) {
    if (!entries.split(/\r?\n/).includes(requiredEntry)) throw new Error(`OCI package is missing ${requiredEntry}`);
  }

  runBash(["-lc", `tar -xzf '${shellPath(archive)}' -C '${shellPath(unpackDir)}'`]);
  runBash(["-lc", "[[ -x ./scripts/oci-cron.sh && -x ./scripts/oci-fundamentals-cron.sh && -x ./scripts/oci-rss-cron.sh ]] && CRON_SECRET=test CRON_SCRIPT_SOURCE_ONLY=1 ./scripts/oci-cron.sh"], { cwd: unpackDir });
  console.log("OCI cron package smoke OK (all cron entry files, tar contents, extraction, executable modes, helper source)");
} finally {
  if (tempRootIsContained && existsSync(tempRootResolved)) rmSync(tempRootResolved, { recursive: true, force: true });
}
