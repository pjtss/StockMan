import fs from "node:fs";
import path from "node:path";

const file = path.resolve("scripts/oci-cron.sh");
const source = fs.readFileSync(file, "utf8");
const matches = [...source.matchAll(/run_cron_endpoint\s+"([^"]+)"\s+(\d+)\s+"([^"]+)"/g)];
if (matches.length === 0) throw new Error("No cron endpoints were found");

const labels = new Set();
for (const [, label, timeout, endpoint] of matches) {
  if (labels.has(label)) throw new Error(`Duplicate cron label: ${label}`);
  labels.add(label);
  if (Number(timeout) < 1) throw new Error(`Invalid timeout for ${label}: ${timeout}`);
  if (!endpoint.startsWith("/api/cron/")) throw new Error(`Invalid cron endpoint for ${label}: ${endpoint}`);
}

const fundamentalsScript = fs.readFileSync(path.resolve("scripts/oci-fundamentals-cron.sh"), "utf8");
const fundamentalsService = fs.readFileSync(path.resolve("deploy/oci/stockman-fundamentals.service"), "utf8");
const fundamentalsTimer = fs.readFileSync(path.resolve("deploy/oci/stockman-fundamentals.timer"), "utf8");
const nginx = fs.readFileSync(path.resolve("deploy/oci/nginx-stockman.conf"), "utf8");
const activation = fs.readFileSync(path.resolve("deploy/oci/stockman-activate"), "utf8");
const workflow = fs.readFileSync(path.resolve(".github/workflows/deploy-oci.yml"), "utf8");
const automationRuns = fs.readFileSync(path.resolve("lib/automation-run-repository.ts"), "utf8");

if (source.includes("/api/cron/instrument-fundamentals")) {
  throw new Error("Instrument fundamentals must not run inline in the shared five-minute cron pipeline");
}
if (!fundamentalsScript.includes("/api/cron/instrument-fundamentals") || !/--max-time\s+15300/.test(fundamentalsScript)) {
  throw new Error("Dedicated fundamentals runner must call its endpoint with a timeout sized for measured full refreshes");
}
if (!/TimeoutStartSec=4h30min/.test(fundamentalsService) || !fundamentalsService.includes("oci-fundamentals-cron.sh")) {
  throw new Error("Dedicated fundamentals service must allow the measured long-run duration and call its own runner");
}
if (!/location\s*=\s*\/api\/cron\/instrument-fundamentals\s*\{[\s\S]*?proxy_read_timeout\s+4h25m;/.test(nginx) ||
    !nginx.includes("proxy_send_timeout 4h25m;")) {
  throw new Error("The fundamentals reverse-proxy route must outlive the client timeout without extending other routes");
}
if (!/OnCalendar=\*:0\/5/.test(fundamentalsTimer) || !/Persistent=true/.test(fundamentalsTimer)) {
  throw new Error("Dedicated fundamentals timer must poll the admin schedule and catch up after downtime");
}
for (const required of [
  "stockman-fundamentals.service",
  "stockman-fundamentals.timer",
  "enable stockman-fundamentals.timer",
  "restart stockman-fundamentals.timer",
  "start --no-block stockman-fundamentals.service",
]) {
  if (!activation.includes(required)) throw new Error(`Deployment activation is missing ${required}`);
}
if (!activation.includes('chmod +x "$TEMP_PATH/scripts/oci-fundamentals-cron.sh"')) {
  throw new Error("Deployment activation must make the dedicated fundamentals runner executable");
}
for (const required of ["oci-fundamentals-cron.sh", "stockman-fundamentals.service", "stockman-fundamentals.timer"]) {
  if (!workflow.includes(required)) throw new Error(`OCI release packaging is missing ${required}`);
}
if (!automationRuns.includes("FUNDAMENTALS_STALE_RUN_AFTER_SECONDS = 5 * 60 * 60") || !automationRuns.includes("module_key = 'instrument-fundamentals'")) {
  throw new Error("Long-running fundamentals executions must have a stale/active-run threshold above the service timeout");
}
if (!fs.readFileSync(path.resolve("app/api/cron/instrument-fundamentals/route.ts"), "utf8").includes("MAX_FUNDAMENTALS_RUNNING_SECONDS = 5 * 60 * 60")) {
  throw new Error("Cron route duplicate-run guard must cover the full dedicated service lifetime");
}
if ((automationRuns.match(/CASE WHEN module_key = 'instrument-fundamentals' THEN \$[23] ELSE \$[12] END/g) ?? []).length < 2 ||
    !automationRuns.includes("[moduleKey, STALE_RUN_AFTER_SECONDS, FUNDAMENTALS_STALE_RUN_AFTER_SECONDS]")) {
  throw new Error("Stale reconciliation and active-run detection must both use the module-specific timeout");
}

console.log(`OCI cron structure OK (${matches.length} shared endpoints + isolated long-running fundamentals timer)`);
