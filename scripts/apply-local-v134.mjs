import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./load-local-env.mjs";
import { Client } from "pg";

const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error(`Refusing non-local database host: ${url.hostname}`);
const migration = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migration/V134__instrument_fundamental_history.sql");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(fs.readFileSync(migration, "utf8"));
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, migration: "V134__instrument_fundamental_history.sql", host: url.hostname }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
