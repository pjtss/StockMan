import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRuntimeStartupSignalTracker } from "./runtime-startup-signals.mjs";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const verifyDistDir = process.env.DEPLOY_VERIFY_DIST_DIR || ".next-deploy-verify";
const commandTimeoutMs = Number(process.env.DEPLOY_VERIFY_COMMAND_TIMEOUT_MS || 900_000);
const smokeRequestTimeoutMs = Number(process.env.DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS || 15_000);

function loadLocalEnv() {
  const file = ".env.local";
  if (!existsSync(file)) return {};
  const values = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || line.startsWith("#")) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    values[match[1]] = value;
  }
  return values;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const executable = isWindows ? process.env.ComSpec : command;
    const executableArgs = isWindows ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
    const child = spawn(executable, executableArgs, { stdio: "inherit", shell: false, ...options });
    const label = `${command} ${args.join(" ")}`;
    console.log(`[deploy-verify] started: ${label}`);
    const progressTimer = setInterval(() => {
      console.log(`[deploy-verify] still running: ${label} (${Date.now() - startedAt}ms)`);
    }, 30_000);
    const timeout = setTimeout(() => {
      console.error(`[deploy-verify] timed out: ${label} (${commandTimeoutMs}ms)`);
      if (isWindows) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false });
      else child.kill("SIGTERM");
      reject(new Error(`${label} timed out after ${commandTimeoutMs}ms`));
    }, commandTimeoutMs);
    const finish = () => { clearInterval(progressTimer); clearTimeout(timeout); };
    child.on("error", (error) => {
      finish();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      finish();
      if (code === 0) {
        console.log(`[deploy-verify] completed: ${label} (${Date.now() - startedAt}ms)`);
        resolve();
      } else reject(new Error(`${label} failed (code=${code}, signal=${signal ?? "none"})`));
    });
  });
}

async function verifyQuality() {
  console.log("[deploy-verify] quality gates");
  await run(npm, ["test", "--", "--run"]);
  // Keep verification's incremental TypeScript state out of the shared
  // workspace file. Concurrent local tools can otherwise lock or replace
  // tsconfig.tsbuildinfo and make a read-only typecheck fail with TS5033.
  await run(npm, ["run", "typecheck", "--", "--tsBuildInfoFile", `${verifyDistDir}/tsconfig.tsbuildinfo`]);
  await run(npm, ["run", "docs:check"]);
  await run(npm, ["run", "audit:verify-scope"]);
  await run(npm, ["run", "audit:kis-boundary"]);
  await run(npm, ["run", "cron:check"]);
  if (!isWindows) await run("bash", ["-n", "scripts/oci-cron.sh"]);
}

async function waitForHealth(url, timeoutMs = 30_000) {
  console.log(`[deploy-verify] smoke start: ${url}`);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (response.ok && contentType.includes("text/html") && body.trim().length > 100) { console.log(`[deploy-verify] smoke ok: ${url} (${response.status})`); return; }
      lastError = new Error(`HTTP ${response.status}, content-type=${contentType}, bodyLength=${body.length}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment smoke test failed for ${url}: ${lastError?.message ?? "timeout"}`);
}

async function waitForJson(url, timeoutMs = 30_000, expectedStatus, init = {}) {
  console.log(`[deploy-verify] smoke start: ${url}`);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (contentType.includes("application/json")) {
        try {
          JSON.parse(body);
          if (expectedStatus === undefined || response.status === expectedStatus) {
            console.log(`[deploy-verify] smoke ok: ${url} (${response.status})`);
            return;
          }
          lastError = new Error(`expected HTTP ${expectedStatus}, received ${response.status}`);
        } catch (error) {
          lastError = new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        lastError = new Error(`HTTP ${response.status}, content-type=${contentType}, bodyLength=${body.length}`);
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment JSON smoke test failed for ${url}: ${lastError?.message ?? "timeout"}`);
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
  if (!(await waitForChildExit(child, 5_000))) {
    if (isWindows) child.kill();
    else child.kill("SIGKILL");
    if (!(await waitForChildExit(child, 5_000))) throw new Error("Standalone runtime process did not exit after cleanup.");
  }
}

async function waitForTcpListener(port, child, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Standalone runtime exited before listening (code=${child.exitCode}).`);
    const connected = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      const finish = (result) => { socket.destroy(); resolve(result); };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(500, () => finish(false));
    });
    if (connected) return Date.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Standalone runtime did not open its TCP listener within ${timeoutMs}ms.`);
}

async function verifyRuntime() {
  const port = process.env.DEPLOY_VERIFY_PORT || await findAvailablePort();
  const staticSource = `${verifyDistDir}/static`;
  const staticTarget = `${verifyDistDir}/standalone/.next/static`;
  const publicStaticTarget = `${verifyDistDir}/standalone/public/_next/static`;
  if (!existsSync(staticSource)) throw new Error(`Standalone package smoke failed: missing ${staticSource}`);
  // Copy into fresh targets. Copying a directory onto an already-created
  // directory is platform-dependent and can produce static/static nesting.
  rmSync(staticTarget, { recursive: true, force: true });
  rmSync(publicStaticTarget, { recursive: true, force: true });
  mkdirSync(`${verifyDistDir}/standalone/.next`, { recursive: true });
  mkdirSync(`${verifyDistDir}/standalone/public/_next`, { recursive: true });
  cpSync(staticSource, staticTarget, { recursive: true });
  cpSync(staticSource, publicStaticTarget, { recursive: true });
  const args = [`${verifyDistDir}/standalone/server.js`];
  // Launch Node directly on Windows. Wrapping it in cmd.exe can orphan the
  // standalone server when the smoke check times out and cleanup targets the
  // short-lived command shell instead of the actual server process.
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...loadLocalEnv(), PORT: port, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    detached: false,
  });
  const runtimeStartedAt = Date.now();
  const startupSignals = createRuntimeStartupSignalTracker(runtimeStartedAt);
  const runtimeDiagnostics = { port, tcpReadyMs: null, ...startupSignals.snapshot() };
  const inspectSafeStartupSignals = (chunk) => {
    Object.assign(runtimeDiagnostics, startupSignals.accept(chunk));
  };
  child.stdout.on("data", inspectSafeStartupSignals);
  child.stderr.on("data", inspectSafeStartupSignals);
  const childExit = new Promise((_, reject) => {
    child.once("error", (error) => reject(new Error(`runtime failed to start: ${error.message}`)));
    child.once("exit", (code, signal) => reject(new Error(`runtime exited before smoke completed (code=${code}, signal=${signal ?? "none"})`)));
  });
  void childExit.catch(() => undefined);
  try {
    runtimeDiagnostics.tcpReadyMs = await waitForTcpListener(port, child);
    console.log(`[deploy-verify] standalone TCP ready: port=${port}, elapsedMs=${runtimeDiagnostics.tcpReadyMs}`);
    await Promise.race([
      (async () => {
        await waitForHealth(`http://127.0.0.1:${port}/charts`);
        await waitForJson(`http://127.0.0.1:${port}/api/kis/us-search?market=INVALID`, 30_000, 400);
        await waitForJson(`http://127.0.0.1:${port}/api/stock/us/top-rising-chart`);
        await waitForJson(`http://127.0.0.1:${port}/api/stock/kr/top-rising-chart`);
        await waitForJson(`http://127.0.0.1:${port}/api/admin/health-probe-history`, 30_000, 401);
        await waitForJson(`http://127.0.0.1:${port}/api/cron/health-probe-snapshot`, 30_000, 401, { method: "POST" });
      })(),
      childExit,
    ]);
    console.log(`[deploy-verify] standalone startup signals: port=${port}, tcpReadyMs=${runtimeDiagnostics.tcpReadyMs}, nextReadyObservedMs=${runtimeDiagnostics.nextReadyObservedMs ?? "not-observed"}, startupErrorSeen=${runtimeDiagnostics.startupErrorSeen}`);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; runtimeDiagnostics=${JSON.stringify(runtimeDiagnostics)}`);
  } finally {
    await stopProcess(child);
    console.log(`[deploy-verify] standalone process cleanup complete: port=${port}`);
  }
}

// Build before the full Vitest suite. On constrained developer/CI hosts the
// test workers can retain enough filesystem/CPU pressure to make a following
// Next build appear hung even though the same build succeeds in isolation.
// Keeping the build first makes that resource dependency explicit and fails
// fast before the longer quality suite runs.
await run(npm, ["run", "build"], { env: { ...process.env, NEXT_DIST_DIR: verifyDistDir } });
await verifyQuality();
await verifyRuntime();
console.log("Deployment verification passed: quality gates, build, and runtime smoke test.");
