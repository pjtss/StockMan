import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const bashCandidates = process.platform === "win32"
  ? [process.env.BASH, "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
  : ["bash"];
const bash = bashCandidates.find((candidate) => candidate && (path.isAbsolute(candidate) ? existsSync(candidate) : true));
if (!bash) throw new Error("Bash is required to verify the OCI activation preflight");

function shellPath(value) {
  let resolved = path.resolve(value).replaceAll("\\", "/");
  if (process.platform === "win32") resolved = resolved.replace(/^([A-Za-z]):\/(.*)$/, (_, drive, rest) => `/${drive.toLowerCase()}/${rest}`);
  return resolved.replaceAll("'", "'\\''");
}

function runBash(args, options = {}) {
  const result = spawnSync(bash, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "stockman-activation-preflight-"));
const tempRootResolved = path.resolve(tempRoot);
const tempBaseResolved = path.resolve(os.tmpdir());
const tempRelativePath = path.relative(tempBaseResolved, tempRootResolved);
const tempRootIsContained = tempRelativePath !== "" && tempRelativePath !== ".." && !tempRelativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(tempRelativePath);

try {
  if (!tempRootIsContained) throw new Error("Refusing to use an activation test directory outside the OS temp directory");
  const deployPath = path.join(tempRootResolved, "current");
  const stagedRelease = path.join(tempRootResolved, "invalid-release");
  mkdirSync(path.join(deployPath), { recursive: true });
  mkdirSync(path.join(stagedRelease, "scripts"), { recursive: true });
  writeFileSync(path.join(deployPath, "release-marker.txt"), "existing-release-preserved\n", "utf8");
  for (const filename of ["oci-cron.sh", "cron-response-classifier.sh", "oci-fundamentals-cron.sh", "oci-rss-cron.sh"]) {
    cpSync(path.resolve("scripts", filename), path.join(stagedRelease, "scripts", filename));
  }
  const archive = path.join(tempRootResolved, "release-missing-server.tar.gz");
  const archiveResult = runBash(["-lc", `tar -czf '${shellPath(archive)}' -C '${shellPath(stagedRelease)}' .`]);
  if (archiveResult.status !== 0) throw new Error(`Unable to prepare invalid activation archive: ${archiveResult.stderr || archiveResult.stdout}`);

  const activationScript = path.resolve("deploy/oci/stockman-activate");
  const result = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(deployPath)}' '${shellPath(archive)}'`]);
  if (result.status === 0) throw new Error("Activation unexpectedly accepted a release with no server.js");
  const failureOutput = `${result.stdout}\n${result.stderr}`;
  if (!failureOutput.includes("release is missing required file: server.js")) throw new Error(`Activation failed for the wrong reason: ${failureOutput}`);
  if (readFileSync(path.join(deployPath, "release-marker.txt"), "utf8") !== "existing-release-preserved\n") {
    throw new Error("Activation preflight changed the existing release contents");
  }
  if (existsSync(`${deployPath}.previous`)) throw new Error("Activation preflight moved the existing release before validation");
  if (existsSync(`${deployPath}.incoming`)) throw new Error("Activation preflight left staged files behind after rejecting the release");

  const corruptArchive = path.join(tempRootResolved, "release-corrupt.tar.gz");
  writeFileSync(corruptArchive, "not a gzip archive\n", "utf8");
  const corruptResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(deployPath)}' '${shellPath(corruptArchive)}'`]);
  if (corruptResult.status === 0) throw new Error("Activation unexpectedly accepted a corrupt release archive");
  if (!`${corruptResult.stdout}\n${corruptResult.stderr}`.includes("release archive is invalid or incomplete")) {
    throw new Error(`Corrupt release archive failed for the wrong reason: ${corruptResult.stderr || corruptResult.stdout}`);
  }
  if (!existsSync(corruptArchive)) throw new Error("Activation removed the source archive after rejecting it");
  if (readFileSync(path.join(deployPath, "release-marker.txt"), "utf8") !== "existing-release-preserved\n") {
    throw new Error("Corrupt archive validation changed the current release contents");
  }
  if (existsSync(`${deployPath}.incoming`) || existsSync(`${deployPath}.previous`)) {
    throw new Error("Corrupt archive validation left staging or previous paths behind");
  }

  const truncatedArchive = path.join(tempRootResolved, "release-truncated.tar.gz");
  const validArchiveBytes = readFileSync(archive);
  if (validArchiveBytes.length < 16) throw new Error("Valid test archive is too small to produce a truncated-gzip regression");
  writeFileSync(truncatedArchive, validArchiveBytes.subarray(0, validArchiveBytes.length - 8));
  const truncatedResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(deployPath)}' '${shellPath(truncatedArchive)}'`]);
  if (truncatedResult.status === 0) throw new Error("Activation unexpectedly accepted a truncated gzip archive");
  if (!`${truncatedResult.stdout}\n${truncatedResult.stderr}`.includes("release archive is invalid or incomplete")) {
    throw new Error(`Truncated release archive failed for the wrong reason: ${truncatedResult.stderr || truncatedResult.stdout}`);
  }
  if (!existsSync(truncatedArchive)) throw new Error("Activation removed the truncated source archive after rejecting it");
  if (readFileSync(path.join(deployPath, "release-marker.txt"), "utf8") !== "existing-release-preserved\n") {
    throw new Error("Truncated archive validation changed the current release contents");
  }
  if (existsSync(`${deployPath}.incoming`) || existsSync(`${deployPath}.previous`)) {
    throw new Error("Truncated archive validation left staging or previous paths behind");
  }

  const corruptedPayloadArchive = path.join(tempRootResolved, "release-corrupted-payload.tar.gz");
  const corruptedPayloadBytes = Buffer.from(validArchiveBytes);
  const corruptedByteIndex = Math.floor(corruptedPayloadBytes.length / 2);
  corruptedPayloadBytes[corruptedByteIndex] ^= 0x01;
  writeFileSync(corruptedPayloadArchive, corruptedPayloadBytes);
  const corruptedPayloadResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(deployPath)}' '${shellPath(corruptedPayloadArchive)}'`]);
  if (corruptedPayloadResult.status === 0) throw new Error("Activation unexpectedly accepted an archive with corrupted gzip payload bytes");
  if (!`${corruptedPayloadResult.stdout}\n${corruptedPayloadResult.stderr}`.includes("release archive is invalid or incomplete")) {
    throw new Error(`Corrupted gzip payload failed for the wrong reason: ${corruptedPayloadResult.stderr || corruptedPayloadResult.stdout}`);
  }
  if (!existsSync(corruptedPayloadArchive)) throw new Error("Activation removed the corrupted source archive after rejecting it");
  if (readFileSync(path.join(deployPath, "release-marker.txt"), "utf8") !== "existing-release-preserved\n") {
    throw new Error("Corrupted gzip payload validation changed the current release contents");
  }
  if (existsSync(`${deployPath}.incoming`) || existsSync(`${deployPath}.previous`)) {
    throw new Error("Corrupted gzip payload validation left staging or previous paths behind");
  }

  const traversalRoot = path.join(tempRootResolved, "path-traversal-probe");
  const traversalDeployPath = path.join(traversalRoot, "current");
  const traversalPayload = path.join(tempRootResolved, "path-traversal-payload");
  const traversalEscapePath = path.join(traversalRoot, "escape-marker.txt");
  mkdirSync(traversalDeployPath, { recursive: true });
  mkdirSync(traversalPayload, { recursive: true });
  writeFileSync(path.join(traversalDeployPath, "release-marker.txt"), "traversal-current-preserved\n", "utf8");
  writeFileSync(path.join(traversalPayload, "escape-marker.txt"), "must-not-escape-staging\n", "utf8");
  const traversalArchive = path.join(tempRootResolved, "release-path-traversal.tar.gz");
  const traversalArchiveResult = runBash(["-lc", `tar -czPf '${shellPath(traversalArchive)}' --transform='s|^escape-marker.txt|../escape-marker.txt|' -C '${shellPath(traversalPayload)}' escape-marker.txt`]);
  if (traversalArchiveResult.status !== 0) throw new Error(`Unable to prepare traversal archive fixture: ${traversalArchiveResult.stderr || traversalArchiveResult.stdout}`);
  const traversalExtractionRoot = path.join(traversalRoot, "direct-extraction");
  const traversalStagingPath = path.join(traversalExtractionRoot, "incoming");
  const directEscapePath = path.join(traversalExtractionRoot, "escape-marker.txt");
  mkdirSync(traversalStagingPath, { recursive: true });
  const traversalExtractionResult = runBash(["-lc", `tar -xzf '${shellPath(traversalArchive)}' -C '${shellPath(traversalStagingPath)}'`]);
  if (existsSync(directEscapePath)) throw new Error("Tar extraction wrote a path-traversal member outside the staging directory");
  if (traversalExtractionResult.status === 0 && !existsSync(path.join(traversalStagingPath, "escape-marker.txt"))) {
    throw new Error("Tar extraction reported success without rejecting or safely containing the traversal member");
  }
  const traversalResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(traversalDeployPath)}' '${shellPath(traversalArchive)}'`]);
  if (traversalResult.status === 0) throw new Error("Activation unexpectedly accepted an incomplete archive containing a path-traversal entry");
  if (existsSync(traversalEscapePath)) throw new Error("Archive extraction wrote a path-traversal member outside the staging directory");
  if (readFileSync(path.join(traversalDeployPath, "release-marker.txt"), "utf8") !== "traversal-current-preserved\n") {
    throw new Error("Path-traversal archive validation changed the current release contents");
  }
  if (existsSync(`${traversalDeployPath}.incoming`) || existsSync(`${traversalDeployPath}.previous`)) {
    throw new Error("Path-traversal archive validation left staging or previous paths behind");
  }

  const migrationlessRelease = path.join(tempRootResolved, "release-missing-migrations");
  mkdirSync(path.join(migrationlessRelease, "scripts"), { recursive: true });
  mkdirSync(path.join(migrationlessRelease, "deploy", "oci"), { recursive: true });
  writeFileSync(path.join(migrationlessRelease, "server.js"), "// test release\n", "utf8");
  for (const filename of ["oci-cron.sh", "cron-response-classifier.sh", "oci-fundamentals-cron.sh", "oci-rss-cron.sh"]) {
    cpSync(path.resolve("scripts", filename), path.join(migrationlessRelease, "scripts", filename));
  }
  for (const filename of [
    "stockman-cron.service", "stockman-cron.timer", "stockman-rss.service", "stockman-rss.timer",
    "stockman-fundamentals.service", "stockman-fundamentals.timer",
  ]) {
    writeFileSync(path.join(migrationlessRelease, "deploy", "oci", filename), "test unit\n", "utf8");
  }
  const migrationlessArchive = path.join(tempRootResolved, "release-missing-migrations.tar.gz");
  const migrationlessArchiveResult = runBash(["-lc", `tar -czf '${shellPath(migrationlessArchive)}' -C '${shellPath(migrationlessRelease)}' .`]);
  if (migrationlessArchiveResult.status !== 0) throw new Error(`Unable to prepare migrationless archive: ${migrationlessArchiveResult.stderr || migrationlessArchiveResult.stdout}`);
  const migrationlessResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(deployPath)}' '${shellPath(migrationlessArchive)}'`]);
  if (migrationlessResult.status === 0) throw new Error("Activation unexpectedly accepted a release with no Flyway SQL migrations");
  const migrationlessOutput = `${migrationlessResult.stdout}\n${migrationlessResult.stderr}`;
  if (!migrationlessOutput.includes("release contains no versioned Flyway SQL migrations: db/migration")) {
    throw new Error(`Migrationless release failed for the wrong reason: ${migrationlessOutput}`);
  }
  if (readFileSync(path.join(deployPath, "release-marker.txt"), "utf8") !== "existing-release-preserved\n") {
    throw new Error("Migration preflight changed the existing release contents");
  }
  if (existsSync(`${deployPath}.previous`)) throw new Error("Migration preflight moved the existing release before validation");
  if (existsSync(`${deployPath}.incoming`)) throw new Error("Migration preflight left staged files behind after rejecting the release");

  const recoverableDeployPath = path.join(tempRootResolved, "recoverable-current");
  const recoverablePreviousPath = `${recoverableDeployPath}.previous`;
  mkdirSync(recoverablePreviousPath, { recursive: true });
  writeFileSync(path.join(recoverablePreviousPath, "release-marker.txt"), "recoverable-previous-preserved\n", "utf8");
  const recoveryResult = runBash(["-lc", `bash '${shellPath(activationScript)}' '${shellPath(recoverableDeployPath)}' '${shellPath(archive)}'`]);
  if (recoveryResult.status === 0) throw new Error("Activation unexpectedly accepted a release with no server.js during recovery retry");
  if (!`${recoveryResult.stdout}\n${recoveryResult.stderr}`.includes("release is missing required file: server.js")) {
    throw new Error(`Recovery retry failed for the wrong reason: ${recoveryResult.stderr || recoveryResult.stdout}`);
  }
  if (readFileSync(path.join(recoverableDeployPath, "release-marker.txt"), "utf8") !== "recoverable-previous-preserved\n") {
    throw new Error("Activation retry did not restore the only remaining previous release");
  }
  if (existsSync(recoverablePreviousPath) || existsSync(`${recoverableDeployPath}.incoming`)) {
    throw new Error("Activation retry left stale previous or incoming paths after recovery");
  }

  const switchDeployPath = path.join(tempRootResolved, "switch-current");
  const switchPreviousPath = `${switchDeployPath}.previous`;
  const switchTempPath = `${switchDeployPath}.incoming`;
  mkdirSync(switchDeployPath, { recursive: true });
  mkdirSync(switchPreviousPath, { recursive: true });
  mkdirSync(switchTempPath, { recursive: true });
  writeFileSync(path.join(switchDeployPath, "release-marker.txt"), "active-release\n", "utf8");
  writeFileSync(path.join(switchPreviousPath, "release-marker.txt"), "stale-previous-release\n", "utf8");
  writeFileSync(path.join(switchTempPath, "release-marker.txt"), "incoming-release\n", "utf8");
  const activationSource = readFileSync(activationScript, "utf8");
  const switchStart = activationSource.indexOf("had_previous_release=0");
  const switchEnd = activationSource.indexOf("chown -R stockman:stockman", switchStart);
  if (switchStart < 0 || switchEnd <= switchStart) throw new Error("Unable to locate release switch block for runtime regression coverage");
  const switchHarness = path.join(tempRootResolved, "activation-switch-harness.sh");
  writeFileSync(switchHarness, `set -euo pipefail\nDEPLOY_PATH='${shellPath(switchDeployPath)}'\nTEMP_PATH='${shellPath(switchTempPath)}'\n${activationSource.slice(switchStart, switchEnd)}\n`, "utf8");
  const switchResult = runBash(["-lc", `bash '${shellPath(switchHarness)}'`]);
  if (switchResult.status !== 0) throw new Error(`Release switch harness failed: ${switchResult.stderr || switchResult.stdout}`);
  if (readFileSync(path.join(switchDeployPath, "release-marker.txt"), "utf8") !== "incoming-release\n") {
    throw new Error("Release switch did not put the incoming release at current");
  }
  if (readFileSync(path.join(switchPreviousPath, "release-marker.txt"), "utf8") !== "active-release\n") {
    throw new Error("Release switch did not preserve the active release as previous");
  }
  if (existsSync(switchTempPath)) throw new Error("Release switch left the incoming staging path behind");

  const signalDeployPath = path.join(tempRootResolved, "signal-current");
  mkdirSync(signalDeployPath, { recursive: true });
  writeFileSync(path.join(signalDeployPath, "release-marker.txt"), "signal-previous-preserved\n", "utf8");
  const previousSignalRelease = `${signalDeployPath}.previous`;
  const moveToPrevious = runBash(["-lc", `mv '${shellPath(signalDeployPath)}' '${shellPath(previousSignalRelease)}'`]);
  if (moveToPrevious.status !== 0) throw new Error(`Unable to stage interrupted release swap: ${moveToPrevious.stderr || moveToPrevious.stdout}`);
  const signalTempPath = `${signalDeployPath}.incoming`;
  mkdirSync(signalTempPath, { recursive: true });
  writeFileSync(path.join(signalTempPath, "staged-marker.txt"), "remove-after-restore\n", "utf8");
  const exitTrap = activationSource.match(/on_exit\(\) \{\r?\n[\s\S]*?\r?\n\}\r?\ntrap on_exit EXIT\r?\ntrap 'exit 129' HUP\r?\ntrap 'exit 130' INT\r?\ntrap 'exit 143' TERM/);
  if (!exitTrap) throw new Error("Unable to locate activation exit/signal traps for runtime regression coverage");
  const signalHarness = path.join(tempRootResolved, "activation-signal-harness.sh");
  writeFileSync(signalHarness, `set -euo pipefail\nstage="activate-files"\nDEPLOY_PATH='${shellPath(signalDeployPath)}'\nTEMP_PATH='${shellPath(signalTempPath)}'\n${exitTrap[0]}\nkill -TERM $$\n`, "utf8");
  const signalResult = runBash(["-lc", `bash '${shellPath(signalHarness)}'`]);
  if (signalResult.status !== 143) throw new Error(`Activation signal harness exited with ${signalResult.status}, expected 143: ${signalResult.stderr || signalResult.stdout}`);
  if (readFileSync(path.join(signalDeployPath, "release-marker.txt"), "utf8") !== "signal-previous-preserved\n") {
    throw new Error("Activation TERM handler did not restore the previous release path");
  }
  if (existsSync(previousSignalRelease)) throw new Error("Activation TERM handler left the previous release path unrestored");
  if (existsSync(signalTempPath)) throw new Error("Activation TERM handler left staged files behind after restoring the previous release");

  const errorHandler = activationSource.match(/on_error\(\) \{\r?\n[\s\S]*?\r?\n\}/);
  if (!errorHandler) throw new Error("Unable to locate activation ERR handler for diagnostic regression coverage");
  const diagnosticsFunction = activationSource.match(/collect_service_diagnostics\(\) \{\r?\n[\s\S]*?\r?\n\}/);
  if (!diagnosticsFunction) throw new Error("Unable to locate shared service diagnostics function");
  const healthProbeFunction = activationSource.match(/probe_stockman_health\(\) \{\r?\n[\s\S]*?\r?\n\}/);
  if (!healthProbeFunction) throw new Error("Unable to locate application health probe function");
  const healthProbeScript = healthProbeFunction[0].match(/node -e '([\s\S]*?)'\r?\n\}/)?.[1];
  if (!healthProbeScript) throw new Error("Unable to extract inline Node health probe for syntax verification");
  const healthProbeSyntax = spawnSync(process.execPath, ["--check", "-"], { input: healthProbeScript, encoding: "utf8" });
  if (healthProbeSyntax.error) throw healthProbeSyntax.error;
  if (healthProbeSyntax.status !== 0) throw new Error(`Inline Node health probe has invalid syntax: ${healthProbeSyntax.stderr}`);
  const diagnosticCapturePath = path.join(tempRootResolved, "activation-error-diagnostics.txt");
  const diagnosticHarness = path.join(tempRootResolved, "activation-error-harness.sh");
  writeFileSync(diagnosticHarness, `set -Eeuo pipefail\nDIAGNOSTIC_CAPTURE='${shellPath(diagnosticCapturePath)}'\nsystemctl() { printf 'systemctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\njournalctl() { printf 'journalctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\n${diagnosticsFunction[0]}\n${errorHandler[0]}\ntrap on_error ERR\nstage="service-restart"\nfalse\n`, "utf8");
  const diagnosticResult = runBash(["-lc", `bash '${shellPath(diagnosticHarness)}'`]);
  const diagnosticOutput = `${diagnosticResult.stdout}\n${diagnosticResult.stderr}`;
  if (diagnosticResult.status !== 1 || !diagnosticOutput.includes("stockman-activate failed: stage=service-restart exit=1")) {
    throw new Error(`Activation ERR handler did not preserve the original failing exit code and stage: ${diagnosticOutput}`);
  }
  const capturedDiagnostics = readFileSync(diagnosticCapturePath, "utf8");
  for (const unit of [
    "stockman-cron.timer", "stockman-rss.timer", "stockman-fundamentals.timer",
    "stockman-cron.service", "stockman-rss.service", "stockman-fundamentals.service",
  ]) {
    if (!capturedDiagnostics.includes(unit)) throw new Error(`Activation ERR handler omitted diagnostics for ${unit}`);
  }

  const serviceLoopStart = activationSource.indexOf("for attempt in $(seq 1 60); do");
  const serviceLoopEnd = activationSource.indexOf("systemctl is-active --quiet stockman-cron.timer", serviceLoopStart);
  if (serviceLoopStart < 0 || serviceLoopEnd <= serviceLoopStart) throw new Error("Unable to locate service readiness timeout for explicit failure coverage");
  const readinessCapturePath = path.join(tempRootResolved, "activation-readiness-diagnostics.txt");
  const readinessHarness = path.join(tempRootResolved, "activation-readiness-harness.sh");
  writeFileSync(readinessHarness, `set -euo pipefail\nDIAGNOSTIC_CAPTURE='${shellPath(readinessCapturePath)}'\nseq() { printf '60\\n'; }\nsystemctl() { printf 'systemctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; if [ "$1" = "is-active" ]; then return 1; fi; }\njournalctl() { printf 'journalctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\n${diagnosticsFunction[0]}\n${activationSource.slice(serviceLoopStart, serviceLoopEnd)}\n`, "utf8");
  const readinessResult = runBash(["-lc", `bash '${shellPath(readinessHarness)}'`]);
  if (readinessResult.status !== 1) throw new Error(`Service readiness timeout returned ${readinessResult.status}, expected 1`);
  const readinessDiagnostics = readFileSync(readinessCapturePath, "utf8");
  if (!readinessDiagnostics.includes("systemctl --no-pager --full status")) {
    throw new Error("Explicit service readiness timeout bypassed shared service status diagnostics");
  }
  for (const unit of ["stockman-cron.service", "stockman-rss.service", "stockman-fundamentals.service"]) {
    if (!readinessDiagnostics.includes(`journalctl --no-pager -u ${unit} -n 40`)) {
      throw new Error(`Explicit service readiness timeout omitted ${unit} journal diagnostics`);
    }
  }

  const healthFailureCapturePath = path.join(tempRootResolved, "activation-health-failure.txt");
  const healthFailureHarness = path.join(tempRootResolved, "activation-health-failure-harness.sh");
  writeFileSync(healthFailureHarness, `set -euo pipefail\nDIAGNOSTIC_CAPTURE='${shellPath(healthFailureCapturePath)}'\nseq() { printf '60\\n'; }\nsleep() { printf 'sleep %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\nsystemctl() { printf 'systemctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\ntimeout() { printf 'timeout %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; return 1; }\njournalctl() { printf 'journalctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\n${healthProbeFunction[0]}\n${diagnosticsFunction[0]}\n${activationSource.slice(serviceLoopStart, serviceLoopEnd)}\n`, "utf8");
  const healthFailureResult = runBash(["-lc", `bash '${shellPath(healthFailureHarness)}'`]);
  const healthFailureOutput = `${healthFailureResult.stdout}\n${healthFailureResult.stderr}`;
  if (healthFailureResult.status !== 1 || !healthFailureOutput.includes("GET /api/health did not return HTTP 200")) {
    throw new Error(`Active service with failed HTTP health did not fail activation clearly: ${healthFailureOutput}`);
  }
  const healthFailureCapture = readFileSync(healthFailureCapturePath, "utf8");
  if (!healthFailureCapture.includes("http://127.0.0.1:3000/api/health")) {
    throw new Error("Activation readiness loop did not probe the local Stockman health endpoint");
  }
  const backoffSnippet = activationSource.match(/retry_delay=\$\(\(attempt < 6 \? attempt \* 2 : 10\)\)\r?\n\s*sleep "\$retry_delay"/)?.[0];
  if (!backoffSnippet || !healthFailureCapture.includes("http://127.0.0.1:3000/api/health")) {
    throw new Error("Readiness loop did not define its bounded retry backoff after the health probe");
  }
  const retryDelayHarness = path.join(tempRootResolved, "activation-retry-delay-harness.sh");
  const retryDelayCapturePath = path.join(tempRootResolved, "activation-retry-delays.txt");
  writeFileSync(retryDelayHarness, `set -euo pipefail\nDIAGNOSTIC_CAPTURE='${shellPath(retryDelayCapturePath)}'\nfor attempt in $(seq 1 10); do\n${backoffSnippet}\n  printf '%s\\n' "$retry_delay" >> "$DIAGNOSTIC_CAPTURE"\ndone\n`, "utf8");
  const retryDelayResult = runBash(["-lc", `bash '${shellPath(retryDelayHarness)}'`]);
  if (retryDelayResult.status !== 0) throw new Error(`Readiness retry delay calculation failed: ${retryDelayResult.stderr}`);
  const retryDelays = readFileSync(retryDelayCapturePath, "utf8").trim().split(/\r?\n/).map(Number);
  if (JSON.stringify(retryDelays) !== JSON.stringify([2, 4, 6, 8, 10, 10, 10, 10, 10, 10])) {
    throw new Error(`Readiness retry delay calculation exceeded or missed its bounded backoff: ${retryDelays.join(",")}`);
  }

  const healthSuccessCapturePath = path.join(tempRootResolved, "activation-health-success.txt");
  const healthSuccessHarness = path.join(tempRootResolved, "activation-health-success-harness.sh");
  writeFileSync(healthSuccessHarness, `set -euo pipefail\nDIAGNOSTIC_CAPTURE='${shellPath(healthSuccessCapturePath)}'\nseq() { printf '1\\n'; }\nsystemctl() { printf 'systemctl %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; }\ntimeout() { printf 'timeout %s\\n' "$*" >> "$DIAGNOSTIC_CAPTURE"; return 0; }\n${healthProbeFunction[0]}\n${activationSource.slice(serviceLoopStart, serviceLoopEnd).replace(/\r?\n$/, "")}\n`, "utf8");
  const healthSuccessResult = runBash(["-lc", `bash '${shellPath(healthSuccessHarness)}'`]);
  if (healthSuccessResult.status !== 0) {
    throw new Error(`Healthy active service was not accepted by readiness loop: ${healthSuccessResult.stderr || healthSuccessResult.stdout}`);
  }
  if (!readFileSync(healthSuccessCapturePath, "utf8").includes("http://127.0.0.1:3000/api/health")) {
    throw new Error("Healthy readiness path skipped the local Stockman health probe");
  }
  console.log("OCI activation recovery smoke OK (archive containment, release recovery, TERM, diagnostics, and HTTP readiness verified)");
} finally {
  if (tempRootIsContained && existsSync(tempRootResolved)) rmSync(tempRootResolved, { recursive: true, force: true });
}
