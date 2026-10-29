import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();

const dryRun = process.argv.includes("--dry-run");
const filePath = process.argv.slice(2).find((argument) => argument !== "--dry-run") ?? "data/market-impact-events.json";
const payload = JSON.parse(await readFile(filePath, "utf8"));
if (payload.schemaVersion !== "market-impact-events.v1" || !payload.markets || !Array.isArray(payload.markets.KR) || !Array.isArray(payload.markets.US) || Object.keys(payload.markets).some((market) => !["KR", "US"].includes(market))) {
  throw new Error("Expected market-impact-events.v1 with separate KR and US event arrays");
}

const values = [
  ...payload.markets.KR.map((event) => ({ ...event, market: "KR" })),
  ...payload.markets.US.map((event) => ({ ...event, market: "US" })),
];
const ids = new Set();
const allowed = {
  market: new Set(["KR", "US"]),
  status: new Set(["REPORTED", "CONFIRMED_SCHEDULED", "ESTIMATED", "COMPLETED", "CANCELLED"]),
  direction: new Set(["POSITIVE", "NEGATIVE", "MIXED", "UNCERTAIN"]),
  impactHorizon: new Set(["INTRADAY", "SHORT_TERM", "LONG_TERM", "UNKNOWN"]),
  confidence: new Set(["HIGH", "MEDIUM", "LOW"]),
};
for (const [index, event] of values.entries()) {
  const required = ["eventId", "eventDate", "market", "ticker", "companyName", "eventType", "status", "direction", "impactHorizon", "title", "summary", "rationale", "confidence", "sourceType", "sourceId", "sourceUrl"];
  const missing = required.filter((key) => typeof event[key] !== "string" || !event[key].trim());
  if (missing.length) throw new Error(`events[${index}] missing: ${missing.join(", ")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) throw new Error(`events[${index}] has invalid eventDate`);
  if (!/^[A-Z0-9._-]{1,32}$/.test(event.ticker)) throw new Error(`events[${index}] has invalid ticker`);
  for (const [field, options] of Object.entries(allowed)) if (!options.has(event[field])) throw new Error(`events[${index}] has invalid ${field}`);
  if (!/^https:\/\//.test(event.sourceUrl)) throw new Error(`events[${index}] sourceUrl must use HTTPS`);
  if (event.publishedAt != null && (typeof event.publishedAt !== "string" || Number.isNaN(Date.parse(event.publishedAt)))) throw new Error(`events[${index}] has invalid publishedAt`);
  for (const field of ["evidence", "risks", "limitations"]) if (event[field] != null && !Array.isArray(event[field])) throw new Error(`events[${index}] ${field} must be an array`);
  if (ids.has(event.eventId)) throw new Error(`Duplicate eventId: ${event.eventId}`);
  ids.add(event.eventId);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  const tickersByMarket = new Map();
  for (const event of values) {
    const tickers = tickersByMarket.get(event.market) ?? new Set();
    tickers.add(event.ticker);
    tickersByMarket.set(event.market, tickers);
  }
  for (const [market, tickers] of tickersByMarket) {
    const table = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
    const result = await client.query(
      `SELECT UPPER(code) AS ticker FROM ${table}
       WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND UPPER(code) = ANY($1::text[])`,
      [[...tickers]],
    );
    const verified = new Set(result.rows.map((row) => row.ticker));
    const unverified = [...tickers].filter((ticker) => !verified.has(ticker));
    if (unverified.length) throw new Error(`Official active COMMON_STOCK verification failed for ${market}: ${unverified.join(", ")}`);
  }
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, schemaVersion: payload.schemaVersion, inputEvents: values.length, verifiedMarkets: [...tickersByMarket.keys()] }));
  } else {
    await client.query("BEGIN");
    for (const event of values) {
      await client.query(
      `INSERT INTO market_impact_events (
        event_id, event_date, market, ticker, company_name, event_type, status, direction,
        impact_horizon, title, summary, rationale, confidence, source_type, source_id,
        source_url, published_at, evidence, risks, limitations, raw_event, updated_at
      ) VALUES (
        $1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17::timestamptz, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, NOW()
      ) ON CONFLICT (event_id) DO UPDATE SET
        event_date = EXCLUDED.event_date, market = EXCLUDED.market, ticker = EXCLUDED.ticker,
        company_name = EXCLUDED.company_name, event_type = EXCLUDED.event_type, status = EXCLUDED.status,
        direction = EXCLUDED.direction, impact_horizon = EXCLUDED.impact_horizon, title = EXCLUDED.title,
        summary = EXCLUDED.summary, rationale = EXCLUDED.rationale, confidence = EXCLUDED.confidence,
        source_type = EXCLUDED.source_type, source_id = EXCLUDED.source_id, source_url = EXCLUDED.source_url,
        published_at = EXCLUDED.published_at, evidence = EXCLUDED.evidence, risks = EXCLUDED.risks,
        limitations = EXCLUDED.limitations, raw_event = EXCLUDED.raw_event, updated_at = NOW()`,
        [event.eventId, event.eventDate, event.market, event.ticker, event.companyName, event.eventType,
          event.status, event.direction, event.impactHorizon, event.title, event.summary, event.rationale,
          event.confidence, event.sourceType, event.sourceId, event.sourceUrl, event.publishedAt ?? null,
          JSON.stringify(event.evidence ?? []), JSON.stringify(event.risks ?? []),
          JSON.stringify(event.limitations ?? []), JSON.stringify(event)],
      );
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, schemaVersion: payload.schemaVersion, inputEvents: values.length, upserted: values.length }));
  }
} catch (error) {
  if (!dryRun) await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
