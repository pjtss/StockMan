import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readLocalEnvFile } from "./local-env.mjs";
import { stopChildProcess, waitForProcessExit } from "./child-process-lifecycle.mjs";
import { createRuntimeStartupSignalTracker } from "./runtime-startup-signals.mjs";
import { runDeploymentVerification } from "./deployment-verification-order.mjs";
import { getSmokeDeadlineMs } from "./smoke-retry-policy.mjs";
import { extractNextStaticScriptPaths, validateNextStaticScriptResponse } from "./next-static-assets.mjs";
import { runChartsBrowserSmoke } from "./charts-browser-smoke.mjs";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const verifyDistDir = process.env.DEPLOY_VERIFY_DIST_DIR || ".next-deploy-verify";
const commandTimeoutMs = Number(process.env.DEPLOY_VERIFY_COMMAND_TIMEOUT_MS || 900_000);
const smokeRequestTimeoutMs = Number(process.env.DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS || 30_000);

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
    let timedOut = false;
    let settled = false;
    const finish = () => { clearInterval(progressTimer); clearTimeout(timeout); };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      finish();
      if (error) reject(error);
      else resolve();
    };
    const timeoutError = () => new Error(`${label} timed out after ${commandTimeoutMs}ms`);
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`[deploy-verify] timed out: ${label} (${commandTimeoutMs}ms)`);
      void stopProcess(child)
        .then(() => {
          console.log(`[deploy-verify] timed-out process cleanup complete: ${label}`);
          settle(timeoutError());
        })
        .catch((error) => settle(new Error(`${timeoutError().message}; cleanup failed: ${error instanceof Error ? error.message : String(error)}`)));
    }, commandTimeoutMs);
    child.on("error", (error) => {
      if (!timedOut) settle(error);
    });
    child.on("exit", (code, signal) => {
      if (timedOut) return;
      if (code === 0) {
        console.log(`[deploy-verify] completed: ${label} (${Date.now() - startedAt}ms)`);
        settle();
      } else settle(new Error(`${label} failed (code=${code}, signal=${signal ?? "none"})`));
    });
  });
}

async function verifyFastGates() {
  console.log("[deploy-verify] fast structural gates");
  await run(npm, ["run", "docs:check"]);
  await run(npm, ["run", "audit:verify-scope"]);
  await run(npm, ["run", "audit:kis-boundary"]);
  await run(npm, ["run", "cron:check"]);
  if (!isWindows) {
    await run("bash", ["-n", "scripts/oci-cron.sh"]);
    await run("bash", ["-n", "scripts/oci-rss-cron.sh"]);
  }
}

async function verifyQuality() {
  console.log("[deploy-verify] full quality gates");
  await run(npm, ["test", "--", "--run"]);
  // Keep verification's incremental TypeScript state out of the shared
  // workspace file. Concurrent local tools can otherwise lock or replace
  // tsconfig.tsbuildinfo and make a read-only typecheck fail with TS5033.
  await run(npm, ["run", "typecheck", "--", "--tsBuildInfoFile", `${verifyDistDir}/tsconfig.tsbuildinfo`]);
  await run(npm, ["run", "docs:check"]);
  await run(npm, ["run", "audit:verify-scope"]);
  await run(npm, ["run", "audit:kis-boundary"]);
  await run(npm, ["run", "audit:bearer-auth"]);
  await run(npm, ["run", "cron:check"]);
  if (!isWindows) await run("bash", ["-n", "scripts/oci-cron.sh"]);
}

async function waitForHealth(url, configuredTimeoutMs = 30_000) {
  console.log(`[deploy-verify] smoke start: ${url}`);
  const timeoutMs = getSmokeDeadlineMs(configuredTimeoutMs, smokeRequestTimeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (response.ok && contentType.includes("text/html") && body.trim().length > 100) {
        console.log(`[deploy-verify] smoke ok: ${url} (${response.status})`);
        return { html: body, url };
      }
      lastError = new Error(`HTTP ${response.status}, content-type=${contentType}, bodyLength=${body.length}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment smoke test failed for ${url}: ${lastError?.message ?? "timeout"}`);
}

async function verifyNextStaticScripts(baseUrl, html) {
  const paths = extractNextStaticScriptPaths(html);
  if (paths.length === 0) throw new Error("Standalone /charts smoke failed: no Next.js static JavaScript chunks were found in the HTML.");
  for (const path of paths) {
    const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.arrayBuffer();
    const validationError = validateNextStaticScriptResponse({ status: response.status, contentType, byteLength: body.byteLength });
    if (validationError) throw new Error(`Standalone static chunk smoke failed for ${path}: ${validationError}`);
  }
  console.log(`[deploy-verify] static JavaScript chunks ok: ${paths.length} referenced chunks`);
}

async function waitForJson(url, configuredTimeoutMs = 30_000, expectedStatus, init = {}) {
  console.log(`[deploy-verify] smoke start: ${url}`);
  const timeoutMs = getSmokeDeadlineMs(configuredTimeoutMs, smokeRequestTimeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (contentType.includes("application/json") || contentType.includes("+json")) {
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

async function stopProcess(child) {
  await stopChildProcess(child, { platform: isWindows ? "win32" : process.platform, spawnProcess: spawn });
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
  const standaloneRoot = `${verifyDistDir}/standalone`;
  const publicDocs = ["openapi.json", "api-reference.md", "llms.txt", "document-catalog.json"];
  mkdirSync(join(standaloneRoot, "public"), { recursive: true });
  for (const name of publicDocs) {
    const source = join(process.cwd(), "public", name);
    if (!existsSync(source)) throw new Error(`Standalone API documentation smoke failed: missing ${source}`);
    cpSync(source, join(standaloneRoot, "public", name));
  }
  const manualsSource = join(process.cwd(), "public", "manuals");
  if (!existsSync(manualsSource)) throw new Error(`Standalone documentation smoke failed: missing ${manualsSource}`);
  cpSync(manualsSource, join(standaloneRoot, "public", "manuals"), { recursive: true });
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
    env: { ...process.env, ...readLocalEnvFile(), PORT: port, NODE_ENV: "production" },
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
    const openApiResponse = await fetch(`http://127.0.0.1:${port}/openapi.json`, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
    if (!openApiResponse.ok) throw new Error(`Standalone OpenAPI smoke failed: HTTP ${openApiResponse.status}`);
    const openApi = await openApiResponse.json();
    if (openApi.openapi !== "3.1.1" || !openApi.paths?.["/api/market-news"] || !openApi.paths?.["/api/public/daily-candles"]
      || !openApi.paths?.["/api/public/market-impact-events"]?.get
      || !openApi.paths?.["/api/public/us-stock-metadata"]?.get
      || !openApi.paths?.["/api/scan/us-obv-divergence"]?.get
      || !openApi.paths?.["/api/public/document-catalog"]?.get
      || !openApi.paths?.["/api/public/api-manual"]?.get) {
      throw new Error("Standalone OpenAPI smoke failed: specification version or expected public paths are missing.");
    }
    const stockMetadataOperation = openApi.paths["/api/public/us-stock-metadata"].get;
    if (stockMetadataOperation.security?.length || !stockMetadataOperation.parameters?.some((parameter) => parameter.name === "ticker" && parameter.required === true)) {
      throw new Error("Standalone OpenAPI smoke failed: stock metadata must be an anonymous GET with a required ticker parameter.");
    }
    for (const [path, marker] of [["/api-reference.md", "StockMan 외부 읽기 전용 API 매뉴얼"], ["/llms.txt", "StockMan API"], ["/document-catalog.json", "stockman-document-catalog.v1"], ["/manuals/README.md", "StockMan 문서 인덱스"]]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
      const body = await response.text();
      if (!response.ok || !body.includes(marker)) throw new Error(`Standalone API documentation smoke failed for ${path}: HTTP ${response.status}`);
    }
    const catalogResponse = await fetch(`http://127.0.0.1:${port}/api/public/document-catalog?q=일봉&limit=5`, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
    const catalogBody = await catalogResponse.json();
    if (!catalogResponse.ok || catalogBody.ok !== true || !Array.isArray(catalogBody.items) || catalogBody.items.length > 5) {
      throw new Error(`Standalone document catalog smoke failed: HTTP ${catalogResponse.status}`);
    }
    const apiManualResponse = await fetch(`http://127.0.0.1:${port}/api/public/api-manual?category=screeners&limit=5`, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
    const apiManualBody = await apiManualResponse.json();
    if (!apiManualResponse.ok || apiManualBody.ok !== true || !apiManualBody.items?.every((operation) => operation.method === "GET" && operation.authentication.required === false)) {
      throw new Error(`Standalone public API manual smoke failed: HTTP ${apiManualResponse.status}`);
    }
    const stockMetadataManualResponse = await fetch(`http://127.0.0.1:${port}/api/public/api-manual?q=us-stock-metadata&limit=5`, { signal: AbortSignal.timeout(smokeRequestTimeoutMs) });
    const stockMetadataManualBody = await stockMetadataManualResponse.json();
    if (!stockMetadataManualResponse.ok || stockMetadataManualBody.ok !== true || !stockMetadataManualBody.items?.some((operation) => operation.path === "/api/public/us-stock-metadata" && operation.authentication.required === false)) {
      throw new Error(`Standalone stock metadata API manual smoke failed: HTTP ${stockMetadataManualResponse.status}`);
    }
    console.log(`[deploy-verify] public API docs ok: ${Object.keys(openApi.paths).length} read operations`);
    await Promise.race([
      (async () => {
        const charts = await waitForHealth(`http://127.0.0.1:${port}/charts`);
        await verifyNextStaticScripts(`http://127.0.0.1:${port}`, charts.html);
        await runChartsBrowserSmoke(`http://127.0.0.1:${port}`);
        await waitForJson(`http://127.0.0.1:${port}/api/kis/us-search?market=INVALID`, 30_000, 400);
        await waitForJson(`http://127.0.0.1:${port}/api/scan/us-obv-divergence?page=0`, 30_000, 400);
        await waitForJson(`http://127.0.0.1:${port}/api/public/market-impact-events?market=INVALID`, 30_000, 400);
        await waitForJson(`http://127.0.0.1:${port}/api/public/us-stock-metadata?ticker=INVALID%21`, 30_000, 400);
        await waitForJson(`http://127.0.0.1:${port}/api/cron/us-obv-divergence-snapshot`, 30_000, 401, { method: "POST" });
        await waitForJson(`http://127.0.0.1:${port}/api/stock/us/top-rising-chart`);
        await waitForJson(`http://127.0.0.1:${port}/api/stock/kr/top-rising-chart`);
        await waitForJson(`http://127.0.0.1:${port}/api/admin/health-probe-history`, 30_000, 401);
        await waitForJson(`http://127.0.0.1:${port}/api/admin/kis-realtime-approval-metrics`, 30_000, 401);
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

// Keep build first so tests cannot hold build output or build resources, then
// smoke the standalone server before Vitest workers add memory/CPU pressure.
// On constrained local runners, running runtime smoke after the full suite can
// make an otherwise ready /charts response exceed the per-request timeout.
await run(npm, ["run", "audit:dependencies"]);
await runDeploymentVerification({
  build: () => run(npm, ["run", "build"], { env: { ...process.env, NEXT_DIST_DIR: verifyDistDir } }),
  runtime: verifyRuntime,
  quality: verifyQuality,
});
console.log("Deployment verification passed: quality gates, build, and runtime smoke test.");
