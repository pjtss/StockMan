const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
type SecTickerRow = { cik: string; name: string; ticker: string; exchange: string };
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

export async function resolveSecTicker(ticker: string) {
  const rows = await loadRows();
  const value = ticker.trim().toUpperCase();
  return rows.find((row) => row.ticker === value) || null;
}
