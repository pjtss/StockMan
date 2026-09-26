import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv({ required: true });

function normalizeCik(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 10) throw new Error("Provide a valid SEC CIK (1-10 digits)");
  return digits.padStart(10, "0");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required in .env.local");
  const database = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
    throw new Error(`Refusing SEC Company Facts integration writes to non-local database: ${database.hostname}`);
  }
  const userAgent = process.env.SEC_USER_AGENT?.trim() || "";
  if (!userAgent || /example\.com|your_email|admin@example/i.test(userAgent)) {
    throw new Error("SEC_USER_AGENT must contain the application identity and a real contact; no SEC request was sent");
  }
  const secBaseUrl = new URL(process.env.SEC_API_BASE_URL || "https://data.sec.gov");
  if (secBaseUrl.hostname !== "data.sec.gov") throw new Error("This integration verifier only permits the official data.sec.gov API host");

  const cik = normalizeCik(process.argv[2] || "320193");
  const { syncSecCompanyFacts } = await import("../lib/sec-company-facts-sync");
  const result = await syncSecCompanyFacts(cik);
  if (!result.ok || !result.archivedId) throw new Error(`SEC Company Facts sync failed: ${result.ok ? "source archive ID missing" : result.error}`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const [raw, parsed] = await Promise.all([
      pool.query("SELECT source_type,source_key,status,url,raw_payload,content_hash FROM sec_source_snapshots WHERE id=$1", [result.archivedId]),
      pool.query("SELECT payload FROM sec_xbrl_snapshots WHERE cik=$1", [cik]),
    ]);
    const source = raw.rows[0];
    const snapshot = parsed.rows[0]?.payload;
    if (!source || source.source_type !== "COMPANY_FACTS" || source.source_key !== cik || source.status !== 200) {
      throw new Error("Stored SEC source archive metadata did not match the requested CIK");
    }
    if (!snapshot || !isDeepStrictEqual(JSON.parse(source.raw_payload), snapshot)) {
      throw new Error("Raw response JSON and parsed database snapshot differ");
    }
    const payload = snapshot as Record<string, unknown>;
    const rawHash = (await import("node:crypto")).createHash("sha256").update(source.raw_payload, "utf8").digest("hex");
    if (rawHash !== source.content_hash) throw new Error("Stored raw response content hash is invalid");
    console.info(JSON.stringify({
      ok: true,
      mode: "LOCAL_SEC_COMPANY_FACTS_E2E",
      cik,
      status: source.status,
      storedUrlHost: new URL(source.url).hostname,
      archivedId: result.archivedId,
      rawBytes: Buffer.byteLength(source.raw_payload, "utf8"),
      rootFieldCount: Object.keys(payload).length,
      taxonomyCount: Object.keys((payload.facts as Record<string, unknown>) || {}).length,
      fullPayloadMatches: true,
      contentHashMatches: true,
    }));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[sec-company-facts-local-verification-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
