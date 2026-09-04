import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: isWindows, ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (code=${code}, signal=${signal ?? "none"})`));
    });
  });
}

async function verifyQuality() {
  await run(npm, ["test", "--", "--run"]);
  await run(npm, ["run", "typecheck"]);
  await run(npm, ["run", "docs:check"]);
  await run(npm, ["run", "cron:check"]);
  if (!isWindows) await run("bash", ["-n", "scripts/oci-cron.sh"]);
}

async function waitForHealth(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment smoke test failed for ${url}: ${lastError?.message ?? "timeout"}`);
}

async function verifyRuntime() {
  const port = process.env.DEPLOY_VERIFY_PORT || "3100";
  const command = isWindows ? "node" : "node";
  const args = [".next/standalone/server.js"];
  const child = spawn(command, args, {
    env: { ...process.env, PORT: port, NODE_ENV: "production" },
    stdio: "inherit",
    shell: isWindows,
  });
  try {
    await waitForHealth(`http://127.0.0.1:${port}/charts`);
  } finally {
    if (child.exitCode === null) {
      if (isWindows) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    }
  }
}

await verifyQuality();
await run(npm, ["run", "build"], { env: { ...process.env } });
await verifyRuntime();
console.log("Deployment verification passed: quality gates, build, and runtime smoke test.");
