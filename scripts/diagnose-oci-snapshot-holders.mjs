import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
  throw new Error("Snapshot diagnostics may run only against the OCI-local database");
}

const releasePath = process.env.STOCKMAN_RELEASE_PATH ?? process.cwd();
const require = createRequire(path.resolve(releasePath, "package.json"));
const { Client } = require("pg");
const execFileAsync = promisify(execFile);
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: "codex-readonly-oci-snapshot-diagnostics",
});

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const endpoint = await client.query("SELECT inet_server_addr()::text AS server_addr, inet_server_port() AS server_port");
  const result = await client.query(`
    SELECT pid, backend_type, application_name, usename, client_addr::text AS client_addr, client_port,
      state, wait_event_type, wait_event,
      query_id::text AS query_id, query,
      backend_xmin IS NOT NULL AS holds_snapshot,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - xact_start)))::integer AS transaction_age_seconds,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - query_start)))::integer AS query_age_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_xmin IS NOT NULL
      AND xact_start < NOW() - INTERVAL '30 seconds'
    ORDER BY xact_start
    LIMIT 50
  `);
  await client.query("COMMIT");

  const targetDockerId = process.env.OCI_DIAGNOSTIC_DOCKER_ID ?? null;
  if (targetDockerId && !/^[a-f0-9]{12,64}$/i.test(targetDockerId)) {
    throw new Error("OCI_DIAGNOSTIC_DOCKER_ID must be a Docker hexadecimal ID");
  }
  const targetedDockerContainer = targetDockerId ? await inspectDockerContainer(targetDockerId) : null;
  const holders = await Promise.all(result.rows.map(async (row) => ({
    pid: row.pid,
    backend_type: row.backend_type,
    application_name: row.application_name,
    usename: row.usename,
    client_addr: row.client_addr,
    client_port: row.client_port,
    state: row.state,
    wait_event_type: row.wait_event_type,
    wait_event: row.wait_event,
    query_id: row.query_id,
    query_shape: normalizeQueryShape(row.query),
    holds_snapshot: row.holds_snapshot,
    transaction_age_seconds: row.transaction_age_seconds,
    query_age_seconds: row.query_age_seconds,
    local_client_process: await inspectLocalClientProcess(row.client_addr, row.client_port),
  })));
  process.stdout.write(`${JSON.stringify({
    diagnosticMode: "read-only",
    databaseHost: database.hostname,
    databaseEndpoint: endpoint.rows[0],
    targetedDockerContainer,
    snapshotHolderCount: result.rowCount,
    holders,
  })}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

async function inspectLocalClientProcess(clientAddress, clientPort) {
  if (!clientAddress || !Number.isInteger(clientPort)) return null;
  const { stdout } = await execFileAsync("ss", ["-tnpH"], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 1_048_576,
  }).catch(() => ({ stdout: "" }));
  const line = stdout.split("\n").find((entry) => {
    const fields = entry.trim().split(/\s+/);
    return fields[3]?.endsWith(`:${clientPort}`)
      && normalizeHost(fields[3].slice(0, -String(clientPort).length - 1)) === normalizeHost(clientAddress);
  });
  if (!line) return { matched_by: "local_socket_source_port", process: null };
  const fields = line.trim().split(/\s+/);
  const processPid = Number(line.match(/\bpid=(\d+)\b/)?.[1]);
  if (!Number.isSafeInteger(processPid) || processPid <= 0) {
    return { matched_by: "local_socket_source_port", local_endpoint: fields[3], process: null };
  }
  return {
    matched_by: "local_socket_source_port",
    local_endpoint: fields[3],
    process: await inspectLocalProcess(processPid),
  };
}

async function inspectLocalProcess(pid) {
  const [comm, status, cgroup] = await Promise.all([
    readFile(`/proc/${pid}/comm`, "utf8").then((value) => value.trim()).catch(() => null),
    readFile(`/proc/${pid}/status`, "utf8").catch(() => null),
    readFile(`/proc/${pid}/cgroup`, "utf8").then((value) => value.trim().split("\n")).catch(() => null),
  ]);
  const pidNamespaceIds = status?.match(/^NSpid:\s*(.+)$/m)?.[1].trim().split(/\s+/) ?? [];
  const matchesDatabasePid = Boolean(comm && /^postgres(?:$|:|\s)/i.test(comm)
    && pidNamespaceIds.includes(String(pid)));
  const systemdUnits = cgroup?.flatMap((entry) => {
    const match = entry.match(/(?:^|\/)([^/]+\.service|[^/]+\.scope)(?:$|\/)/);
    return match ? [match[1]] : [];
  }) ?? [];
  const dockerId = cgroup?.join("\n").match(/docker-([a-f0-9]{64})\.scope/i)?.[1] ?? null;
  const dockerContainer = dockerId ? await inspectDockerContainer(dockerId) : null;
  return {
    comm,
    pid_namespace_ids: pidNamespaceIds,
    matches_local_pid: pidNamespaceIds.includes(String(pid)),
    systemd_units: pidNamespaceIds.includes(String(pid)) ? [...new Set(systemdUnits)] : [],
    docker_container: dockerContainer,
  };
}

async function inspectDockerContainer(dockerId) {
  const { stdout } = await execFileAsync("docker", ["ps", "--no-trunc", "--filter", `id=${dockerId}`, "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}"], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 65_536,
  }).catch(() => ({ stdout: "" }));
  const [id, name, image, status] = stdout.trim().split("\t");
  return id ? { id: id.slice(0, 12), name, image, status } : null;
}

function normalizeHost(value) {
  return value.split("/", 1)[0].replace(/^\[|\]$/g, "").replace(/^::ffff:/i, "").toLowerCase();
}

function normalizeQueryShape(query) {
  if (typeof query !== "string") return null;
  return query
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\$[a-zA-Z_0-9]*\$[\s\S]*?\$[a-zA-Z_0-9]*\$/g, "$STRING")
    .replace(/'(?:''|[^'])*'/g, "'$STRING'")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}
