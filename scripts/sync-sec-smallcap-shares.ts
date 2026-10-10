import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { syncSecSmallcapShareFacts } from "../lib/sec-smallcap-share-sync";

loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error(`Refusing non-local database host: ${database.hostname}`);
if (!process.env.SEC_USER_AGENT?.trim()) throw new Error("SEC_USER_AGENT must identify the application and include a contact email");

const pool = new pg.Pool({ connectionString: databaseUrl });
void syncSecSmallcapShareFacts(pool)
  .then((result) => {
    console.info(JSON.stringify({ ...result, databaseHost: database.hostname, runFinishedAt: new Date().toISOString() }));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(`[sync-sec-smallcap-shares] ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
