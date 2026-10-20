import { readFile } from "node:fs/promises";
import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv({ required: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prerequisite = await client.query("SELECT to_regclass('public.sec_submissions') AS submissions, to_regclass('public.sec_filing_documents') AS documents");
    if (!prerequisite.rows[0].submissions || !prerequisite.rows[0].documents) throw new Error("SEC prerequisite tables are missing");
    const existing = await client.query("SELECT 1 FROM public.flyway_schema_history WHERE version = '142' AND success = true LIMIT 1");
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ ok: true, applied: false, reason: "already_applied" }));
      return;
    }
    await client.query(await readFile(new URL("../db/migration/V142__sec_codex_analysis_queue.sql", import.meta.url), "utf8"));
    const historyColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flyway_schema_history'");
    const columns = new Set(historyColumns.rows.map((row) => row.column_name));
    if (!["installed_rank", "version", "description", "type", "script", "installed_by", "installed_on", "execution_time", "success"].every((name) => columns.has(name))) throw new Error("Unsupported flyway_schema_history shape");
    const rank = await client.query("SELECT COALESCE(MAX(installed_rank), 0) + 1 AS next_rank FROM public.flyway_schema_history");
    await client.query("INSERT INTO public.flyway_schema_history (installed_rank, version, description, type, script, installed_by, installed_on, execution_time, success) VALUES ($1, '142', 'sec codex analysis queue', 'SQL', 'V142__sec_codex_analysis_queue.sql', current_user, NOW(), 0, true)", [rank.rows[0].next_rank]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, applied: true, migration: "V142__sec_codex_analysis_queue.sql" }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(`[apply-v142-failed] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
