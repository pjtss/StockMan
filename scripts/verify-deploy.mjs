import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const verifyDistDir = process.env.DEPLOY_VERIFY_DIST_DIR || ".next-deploy-verify";
const commandTimeoutMs = Number(process.env.DEPLOY_VERIFY_COMMAND_TIMEOUT_MS || 900_000);

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
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
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

async function verifyStaticAsset(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("javascript")) {
    throw new Error(`Static asset smoke failed: HTTP ${response.status}, content-type=${contentType}, url=${url}`);
  }
  console.log(`[deploy-verify] static asset ok: ${url} (${response.status})`);
}

async function waitForJson(url, timeoutMs = 30_000) {
  console.log(`[deploy-verify] smoke start: ${url}`);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (contentType.includes("application/json")) {
        try {
          JSON.parse(body);
          console.log(`[deploy-verify] smoke ok: ${url} (${response.status})`);
          return;
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

function stopProcess(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false });
  } else {
    child.kill("SIGTERM");
  }
}

async function verifyRuntime() {
  const port = process.env.DEPLOY_VERIFY_PORT || await findAvailablePort();
  const staticSource = `${verifyDistDir}/static`;
  const staticTarget = `${verifyDistDir}/standalone/.next/static`;
  if (!existsSync(staticSource)) throw new Error(`Standalone package smoke failed: missing ${staticSource}`);
  mkdirSync(staticTarget, { recursive: true });
  cpSync(staticSource, staticTarget, { recursive: true });
  const command = isWindows ? "node" : "node";
  const args = [`${verifyDistDir}/standalone/server.js`];
  const executable = isWindows ? process.env.ComSpec : command;
  const executableArgs = isWindows ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  const child = spawn(executable, executableArgs, {
    env: { ...process.env, ...loadLocalEnv(), PORT: port, NODE_ENV: "production" },
    stdio: "ignore",
    shell: false,
    detached: false,
  });
  const childExit = new Promise((_, reject) => child.once("exit", (code, signal) => reject(new Error(`runtime exited before smoke completed (code=${code}, signal=${signal ?? "none"})`))));
  try {
    await Promise.race([
      (async () => {
        await waitForHealth(`http://127.0.0.1:${port}/charts`);
        const htmlResponse = await fetch(`http://127.0.0.1:${port}/charts`, { signal: AbortSignal.timeout(5_000) });
        const html = await htmlResponse.text();
        const assetPath = html.match(/(?:src|href)="(\/_next\/static\/[^"?]+\.js)"/)?.[1];
        if (!assetPath) throw new Error("Static asset smoke failed: no JavaScript asset found in /charts HTML");
        await verifyStaticAsset(`http://127.0.0.1:${port}${assetPath}`);
        await waitForJson(`http://127.0.0.1:${port}/api/stock/us/top-rising-chart`);
        await waitForJson(`http://127.0.0.1:${port}/api/stock/kr/top-rising-chart`);
      })(),
      childExit,
    ]);
  } finally {
    await stopProcess(child);
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
