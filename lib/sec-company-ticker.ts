const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
export type SecTickerRow = { cik: string; name: string; ticker: string; exchange: string };
let cache: Promise<SecTickerRow[]> | null = null;

export function extractSecCik(title: string) {
  return title.match(/\((\d{10})\)/)?.[1] || "";
}

async function loadRows() {
  if (!cache) {
    cache = fetch(SEC_TICKER_URL, { headers: { "user-agent": process.env.SEC_USER_AGENT || "StockMan research admin@example.com" }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`SEC company ticker map failed: ${response.status}`);
        const body = await response.json() as { fields?: string[]; data?: unknown[][] };
        const fields = body.fields || [];
        const index = (name: string) => fields.indexOf(name);
        return (body.data || []).map((row) => ({ cik: String(row[index("cik")] || "").padStart(10, "0"), name: String(row[index("name")] || ""), ticker: String(row[index("ticker")] || "").toUpperCase(), exchange: String(row[index("exchange")] || "") })).filter((row) => row.cik && row.ticker);
      })
      .catch((error) => { cache = null; throw error; });
  }
  return cache;
}

export async function resolveSecCompanyTickers(ciks: string[]) {
  const rows = await loadRows();
  const wanted = new Set(ciks.filter(Boolean).map((cik) => cik.padStart(10, "0")));
  return rows.filter((row) => wanted.has(row.cik));
}

const nonCommonTicker = /(?:^|[-.])(UN|U|WT|W|WS|WW|RT|R|P[A-Z]?)$/i;
const nonCommonName = /\b(?:units?|warrants?|rights?|preferred)\b/i;

/**
 * Select one ordinary-share ticker per CIK for market reaction lookups.
 * The SEC mapping can contain units, warrants, rights and preferred classes
 * for the same issuer.  Returning the last row (or an arbitrary row) can
 * silently resolve a filing to a non-tradable derivative, so candidates are
 * ranked and derivative rows are excluded first.
 */
export function selectPreferredSecCompanyTicker(rows: SecTickerRow[], cik?: string) {
  const wanted = cik ? cik.padStart(10, "0") : undefined;
  const candidates = rows.filter((row) => (!wanted || row.cik === wanted) && row.ticker);
  const common = candidates.filter((row) => !nonCommonTicker.test(row.ticker) && !nonCommonName.test(row.name));
  const pool = common;
  return [...pool].sort((a, b) => {
    const classRank = (ticker: string) => /-[A-Z]$/.test(ticker) ? 1 : 0;
    return classRank(a.ticker) - classRank(b.ticker) || a.ticker.localeCompare(b.ticker);
  })[0] || null;
}

export async function resolvePreferredSecCompanyTickers(ciks: string[]) {
  const rows = await resolveSecCompanyTickers(ciks);
  const byCik = new Map<string, SecTickerRow>();
  for (const cik of new Set(ciks.filter(Boolean).map((value) => value.padStart(10, "0")))) {
    const selected = selectPreferredSecCompanyTicker(rows, cik);
    if (selected) byCik.set(cik, selected);
  }
  return [...byCik.values()];
}

export async function resolveSecTicker(ticker: string) {
  const rows = await loadRows();
  const value = ticker.trim().toUpperCase();
  return rows.find((row) => row.ticker === value) || null;
}
