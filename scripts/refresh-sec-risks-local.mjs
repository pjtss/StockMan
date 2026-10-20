import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pg = require("../.next/standalone/node_modules/pg");

const args = new Map(process.argv.slice(2).filter((v) => v.startsWith("--")).map((v) => { const [k, ...r] = v.slice(2).split("="); return [k, r.join("=") || "true"]; }));
const mode = String(args.get("mode") || "DRY_RUN").toUpperCase();
const runId = String(args.get("run-id") || new Date().toISOString().replace(/[:.]/g, "-"));
const inputPath = args.get("input");
const maxMarketCapUsd = Number(args.get("max-market-cap") || 10_000_000);
if (!Number.isFinite(maxMarketCapUsd) || maxMarketCapUsd <= 0) throw new Error("max-market-cap은 양수여야 합니다.");
const dbUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("LOCAL_DATABASE_URL 또는 DATABASE_URL이 필요합니다.");
if (!["DRY_RUN", "APPLY"].includes(mode)) throw new Error("mode는 DRY_RUN 또는 APPLY여야 합니다.");
const pool = new pg.Pool({ connectionString: dbUrl });
const outputDir = path.resolve(".tmp", "sec-risk-refresh", runId);
const allowed = { severity: new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), direction: new Set(["NEGATIVE", "MIXED"]), status: new Set(["ACTIVE", "RESOLVED", "UNKNOWN"]) };
function error(message) { throw new Error(message); }
function validateRisk(risk) {
  if (!risk || typeof risk !== "object" || risk.schemaVersion !== 2 || !Array.isArray(risk.items) || risk.items.length > 100) error("INVALID_RISK_DOCUMENT");
  const ids = new Set();
  for (const item of risk.items) {
    for (const key of ["riskId", "category", "severity", "direction", "status", "summary", "originalText", "koreanText", "details", "confidence"]) if (!String(item[key] ?? "").trim()) error(`RISK_${key.toUpperCase()}_REQUIRED`);
    if (ids.has(item.riskId)) error("DUPLICATE_RISK_ID"); ids.add(item.riskId);
    if (!allowed.severity.has(item.severity) || !allowed.direction.has(item.direction) || !allowed.status.has(item.status)) error("INVALID_RISK_ENUM");
    if (!Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.some((e) => e.source !== "SEC" || !/^https:\/\/(www\.)?sec\.gov\//.test(e.url || "") || !String(e.accession || "").trim())) error("INVALID_SEC_EVIDENCE");
  }
  return risk;
}
async function write(name, value) { await fs.mkdir(outputDir, { recursive: true }); await fs.writeFile(path.join(outputDir, name), JSON.stringify(value, null, 2), "utf8"); }
try {
  const target = await pool.query(`SELECT u.market,u.code AS ticker,u.name AS company_name,f.market_cap,f.observed_at AS market_cap_observed_at FROM us_common_stock_universe u LEFT JOIN LATERAL (SELECT market_cap,observed_at FROM instrument_fundamental_snapshots WHERE market=u.market AND code=u.code ORDER BY observed_at DESC NULLS LAST,fetched_at DESC NULLS LAST LIMIT 1) f ON true WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND COALESCE(u.is_etf,false)=false AND f.market_cap IS NOT NULL AND f.market_cap <= $1 ORDER BY u.market,u.code`, [maxMarketCapUsd]);
  const snapshot = target.rows.map((r) => ({ market: r.market, ticker: r.ticker, companyName: r.company_name, marketCapUsd: Number(r.market_cap), marketCapObservedAt: r.market_cap_observed_at }));
  await write("universe.json", { runId, createdAt: new Date().toISOString(), count: snapshot.length, items: snapshot });
  const result = { runId, mode, maxMarketCapUsd, universeCount: snapshot.length, inputCount: 0, accepted: [], rejected: [], applied: [] };
  if (inputPath) {
    const input = JSON.parse(await fs.readFile(path.resolve(String(inputPath)), "utf8"));
    const entries = Array.isArray(input) ? input : input.items;
    if (!Array.isArray(entries)) error("INPUT_ITEMS_REQUIRED");
    const targetKeys = new Set(snapshot.map((r) => `${r.market}:${r.ticker}`)); result.inputCount = entries.length;
    for (const entry of entries) {
      try {
        const key = `${String(entry.market).toUpperCase()}:${String(entry.ticker).toUpperCase()}`;
        if (!targetKeys.has(key)) error("OUT_OF_SCOPE_TARGET");
        const risk = validateRisk(entry.risk);
        const targetRow = snapshot.find((row) => `${row.market}:${row.ticker}` === key);
        result.accepted.push({ market: String(entry.market).toUpperCase(), ticker: String(entry.ticker).toUpperCase(), companyName: entry.companyName || targetRow.companyName, risk });
      } catch (e) { result.rejected.push({ market: entry.market, ticker: entry.ticker, error: e instanceof Error ? e.message : String(e) }); }
    }
  }
  await write("validation.json", result);
  if (mode === "APPLY") {
    if (!inputPath || result.rejected.length || result.accepted.length !== result.inputCount) error("APPLY_REQUIRES_VALID_INPUT");
    const client = await pool.connect();
    try { await client.query("BEGIN"); for (const item of result.accepted) { const rows = await client.query(`INSERT INTO sec_stock_risks (market,ticker,company_name,risk,risk_as_of,updated_at,updated_by) VALUES ($1,$2,$3,$4::jsonb,CURRENT_DATE,NOW(),'LOCAL_API') ON CONFLICT (market,ticker) DO UPDATE SET company_name=EXCLUDED.company_name,risk=EXCLUDED.risk,risk_as_of=EXCLUDED.risk_as_of,updated_at=NOW(),updated_by='LOCAL_API' RETURNING market,ticker`, [item.market, item.ticker, item.companyName, JSON.stringify(item.risk)]); result.applied.push(rows.rows[0]); } await client.query("COMMIT"); } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    await write("apply-result.json", result);
  }
  console.log(JSON.stringify({ ok: true, outputDir, ...result }, null, 2));
} finally { await pool.end(); }
