import fs from "node:fs/promises";
const source = JSON.parse(await fs.readFile(".tmp/sec-week-candidates-20260929.json", "utf8"));
const agent = process.env.SEC_USER_AGENT;
const terms = /2026[-/ ]?10|October|Oct\.?|주주총회|annual meeting|special meeting|FDA|clinical|trial|data readout|conference|offering|warrant|dilution|Nasdaq|compliance|delist|deadline|expected|予定|will be held/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let last = 0;
async function get(url) {
  const wait = Math.max(0, 125 - (Date.now() - last)); if (wait) await sleep(wait); last = Date.now();
  const response = await fetch(url, { headers: { "user-agent": agent, accept: "text/html" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}
function text(html) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function snippets(value) { const out = []; const re = new RegExp(`.{0,240}${terms.source}.{0,420}`, "gi"); for (const m of value.matchAll(re)) out.push(m[0]); return [...new Set(out)].slice(0, 8); }
const rows = [];
for (const item of source.items) for (const filing of item.filings || []) {
  if (filing.filingDate < "2026-09-22" || !/^(8-K|8-K\/A|6-K|6-K\/A|20-F|20-F\/A|10-Q|NT 10-Q|NT 10-K|424B[345]|S-1|S-1\/A|F-1|F-1\/A|S-3|F-3|25-NSE)$/.test(filing.form)) continue;
  try { const body = text(await get(filing.url)); const found = snippets(body); if (found.length) rows.push({ ticker: item.code, name: item.name, form: filing.form, filingDate: filing.filingDate, items: filing.items, accession: filing.accession, url: filing.url, snippets: found }); }
  catch (error) { rows.push({ ticker: item.code, form: filing.form, filingDate: filing.filingDate, accession: filing.accession, url: filing.url, error: String(error) }); }
}
await fs.writeFile(".tmp/sec-upcoming-snippets-20260929.json", JSON.stringify({ horizon: "2026-09-29..2026-10-06", rows }, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, candidates: rows.length, output: ".tmp/sec-upcoming-snippets-20260929.json" }, null, 2));
