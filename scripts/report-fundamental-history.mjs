import "./load-local-env.mjs";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const table = (await client.query("SELECT to_regclass('public.instrument_fundamental_history') AS table_name")).rows[0]?.table_name ?? null;
  const history = table
    ? (await client.query("SELECT COUNT(*)::int AS rows, MIN(observed_at) AS first_observed, MAX(observed_at) AS last_observed, COUNT(DISTINCT CONCAT(market, ':', code))::int AS instruments FROM instrument_fundamental_history")).rows[0]
    : null;
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), table, history, readyForAsOfMarketCapValidation: Boolean(table && Number(history?.rows ?? 0) > 0) }, null, 2));
} finally {
  await client.end();
}
