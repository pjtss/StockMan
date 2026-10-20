import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv({ required: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query("SELECT to_regclass('public.sec_submissions') AS submissions, to_regclass('public.sec_filing_documents') AS documents, to_regclass('public.sec_codex_analysis_queue') AS queue");
  console.log(JSON.stringify(result.rows[0]));
  await pool.end();
}

void main();
