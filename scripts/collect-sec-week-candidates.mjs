import { createRequire } from "node:module";
import fs from "node:fs/promises";
const require = createRequire(import.meta.url);
const pg = require("../.next/standalone/node_modules/pg");
const pool = new pg.Pool({ connectionString: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL });
const agent = process.env.SEC_USER_AGENT;
if (!agent) throw new Error("SEC_USER_AGENT is required");
const runId = "2026-09-29T06:40:15.848Z";
const headers = { "user-agent": agent, accept: "application/json" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slots = [];
async function secJson(url) {
  while (slots.length >= 8) await sleep(25);
  slots.push(Date.now());
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`SEC ${response.status}: ${url}`);
    return await response.json();
  } finally { slots.shift(); }
}
const tickers = await pool.query("SELECT code,name,market,market_cap_usd FROM us_daily_open_high_50_results WHERE run_started_at=$1 ORDER BY code", [runId]);
const map = await secJson("https://www.sec.gov/files/company_tickers.json");
const byTicker = new Map(Object.values(map).map((row) => [String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0")]));
const out = [];
for (const row of tickers.rows) {
  const cik = byTicker.get(row.code.toUpperCase());
  if (!cik) { out.push({ ...row, cik: null, error: "SEC_TICKER_NOT_FOUND" }); continue; }
  try {
    const data = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const recent = data.filings?.recent ?? {};
    const filings = (recent.accessionNumber || []).map((accession, i) => ({
      accession, form: recent.form?.[i], filingDate: recent.filingDate?.[i], reportDate: recent.reportDate?.[i] ?? null,
      acceptanceDateTime: recent.acceptanceDateTime?.[i] ?? null, primaryDocument: recent.primaryDocument?.[i] ?? null,
      items: recent.items?.[i] ?? null, description: recent.primaryDocDescription?.[i] ?? null,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${recent.primaryDocument?.[i] || `${accession}-index.html`}`,
    })).filter((item) => item.filingDate >= "2026-06-22");
    out.push({ ...row, cik, company: data.name, filings });
  } catch (error) { out.push({ ...row, cik, error: error instanceof Error ? error.message : String(error) }); }
  await sleep(100);
}
await fs.writeFile(".tmp/sec-week-candidates-20260929.json", JSON.stringify({ runId, collectedAt: new Date().toISOString(), horizon: { from: "2026-09-29", to: "2026-10-06" }, items: out }, null, 2), "utf8");
const summary = { tickers: out.length, cikFound: out.filter((x) => x.cik).length, filings: out.reduce((n, x) => n + (x.filings?.length || 0), 0), forms: {} };
for (const item of out) for (const filing of item.filings || []) summary.forms[filing.form] = (summary.forms[filing.form] || 0) + 1;
console.log(JSON.stringify({ ok: true, output: ".tmp/sec-week-candidates-20260929.json", summary }, null, 2));
await pool.end();
