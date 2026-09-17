import { spawn } from "node:child_process";
import { createServer } from "node:net";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const verifyDistDir = process.env.DEPLOY_VERIFY_DIST_DIR || ".next-deploy-verify";

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
    const finish = () => clearInterval(progressTimer);
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
  await run(npm, ["run", "typecheck"]);
  await run(npm, ["run", "docs:check"]);
  await run(npm, ["run", "audit:verify-scope"]);
  await run(npm, ["run", "audit:kis-boundary"]);
  await run(npm, ["run", "cron:check"]);
  if (!isWindows) await run("bash", ["-n", "scripts/oci-cron.sh"]);
}

async function waitForHealth(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (response.ok && contentType.includes("text/html") && body.trim().length > 100) return;
      lastError = new Error(`HTTP ${response.status}, content-type=${contentType}, bodyLength=${body.length}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment smoke test failed for ${url}: ${lastError?.message ?? "timeout"}`);
}

async function waitForJson(url, timeoutMs = 30_000) {
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
  const command = isWindows ? "node" : "node";
  const args = [`${verifyDistDir}/standalone/server.js`];
  const executable = isWindows ? process.env.ComSpec : command;
  const executableArgs = isWindows ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  const child = spawn(executable, executableArgs, {
    env: { ...process.env, PORT: port, NODE_ENV: "production" },
    stdio: "ignore",
    shell: false,
    detached: false,
  });
  try {
    await waitForHealth(`http://127.0.0.1:${port}/charts`);
    await waitForJson(`http://127.0.0.1:${port}/api/stock/us/top-rising-chart`);
    await waitForJson(`http://127.0.0.1:${port}/api/stock/kr/top-rising-chart`);
  } finally {
    await stopProcess(child);
  }
}

await verifyQuality();
await run(npm, ["run", "build"], { env: { ...process.env, NEXT_DIST_DIR: verifyDistDir } });
await verifyRuntime();
console.log("Deployment verification passed: quality gates, build, and runtime smoke test.");
