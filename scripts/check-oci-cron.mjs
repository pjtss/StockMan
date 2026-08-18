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

console.log(`OCI cron structure OK (${matches.length} endpoints)`);
