import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnvFile() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnvFile();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const databaseUrl = new URL(process.env.DATABASE_URL);
const isLocalDatabase = ["localhost", "127.0.0.1"].includes(databaseUrl.hostname);
const client = new Client({ connectionString: process.env.DATABASE_URL, ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: false } }) });
await client.connect();

const queries = {
  kr: {
    markets: ["KOSPI", "KOSDAQ"],
    candle: "kr_instrument_universe_candles",
    universe: "kr_common_stock_universe",
    summary: "kr_latest_daily_candles",
  },
  us: {
    markets: ["NAS", "NYS", "AMS"],
    candle: "us_instrument_universe_candles",
    universe: "us_common_stock_universe",
    summary: "us_latest_daily_candles",
  },
};

async function explain(label, text, params) {
  const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, params);
  const plan = result.rows[0]["QUERY PLAN"][0];
  return { label, planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], buffers: plan["Plan"]?.['Shared Read Blocks'] ?? 0 };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function explainRepeated(label, text, params, repetitions = 5) {
  const samples = [];
  for (let i = 0; i < repetitions; i += 1) samples.push(await explain(label, text, params));
  return {
    label,
    repetitions,
    planningMsP50: percentile(samples.map((sample) => sample.planningMs), 0.5),
    planningMsP95: percentile(samples.map((sample) => sample.planningMs), 0.95),
    executionMsP50: percentile(samples.map((sample) => sample.executionMs), 0.5),
    executionMsP95: percentile(samples.map((sample) => sample.executionMs), 0.95),
    buffersP50: percentile(samples.map((sample) => sample.buffers), 0.5),
  };
}

const output = { measuredAt: new Date().toISOString(), scopes: {} };
for (const [scope, config] of Object.entries(queries)) {
  const params = [config.markets, "20260901"];
  output.scopes[scope] = {
    activeCommon: (await client.query(`SELECT COUNT(*)::int AS count FROM ${config.universe} WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK' AND market=ANY($1)`, [config.markets])).rows[0].count,
    dailyRows: (await client.query(`SELECT COUNT(*)::int AS count FROM ${config.candle} WHERE timeframe='D' AND volume>0 AND market=ANY($1)`, [config.markets])).rows[0].count,
    indexes: (await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE $1 ORDER BY indexname`, [`${scope}_candles_screener%`])).rows.map((row) => row.indexname),
    plans: [],
  };
  output.scopes[scope].plans.push(await explainRepeated(`${scope}-asof-market-latest`, `WITH instrument_daily_latest AS (SELECT DISTINCT ON (market, code) market, code, candle_date FROM ${config.candle} WHERE timeframe='D' AND volume>0 AND market=ANY($1) AND candle_date <= $2 ORDER BY market, code, candle_date DESC) SELECT market, MAX(candle_date) AS candle_date FROM instrument_daily_latest GROUP BY market`, params));
  output.scopes[scope].plans.push(await explainRepeated(`${scope}-asof-instrument-latest`, `SELECT DISTINCT ON (market, code) market, code, candle_date FROM ${config.candle} WHERE timeframe='D' AND volume>0 AND market=ANY($1) AND candle_date <= $2 ORDER BY market, code, candle_date DESC`, params));
  output.scopes[scope].plans.push(await explainRepeated(`${scope}-summary-latest`, `SELECT market, code, candle_date FROM ${config.summary} WHERE volume>0 AND market=ANY($1)`, [config.markets]));
}
console.log(JSON.stringify(output, null, 2));
await client.end();
