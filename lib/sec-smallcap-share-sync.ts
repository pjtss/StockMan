import type { Pool } from "pg";
import { companyFactsUrl, fetchSecJson } from "@/lib/sec-edgar-client";
import { isSecEligibleSmallcapCandidate, selectSecSharesFacts, type SecSmallcapCandidate } from "@/lib/sec-smallcap-shares";

type SecTickerMap = { fields?: string[]; data?: unknown[][] };
const LOCK_CLASS = 146;
const LOCK_ID = 2_026_101_001;

async function fetchCompanyFactsWithRetry(cik: string) {
  let response = await fetchSecJson<Record<string, unknown>>(companyFactsUrl(cik));
  for (let attempt = 1; attempt < 3 && !response.ok && (response.status === 429 || response.status >= 500 || response.status === 0); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    response = await fetchSecJson<Record<string, unknown>>(companyFactsUrl(cik));
  }
  return response;
}

/** Refresh both SEC share facts independently for eligible US common stocks. */
export async function syncSecSmallcapShareFacts(pool: Pool) {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockResult = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1, $2) AS locked", [LOCK_CLASS, LOCK_ID]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return { ok: true, skipped: true, reason: "already_running" };

    const tickerResponse = await fetchSecJson<SecTickerMap>("https://www.sec.gov/files/company_tickers_exchange.json");
    if (!tickerResponse.ok) throw new Error(`SEC ticker master failed: HTTP ${tickerResponse.status}`);
    const fields = tickerResponse.data.fields ?? [];
    const index = (field: string) => fields.indexOf(field);
    const secRows = (tickerResponse.data.data ?? []).map((row) => ({
      cik: String(row[index("cik")] ?? "").padStart(10, "0"),
      ticker: String(row[index("ticker")] ?? "").trim().toUpperCase(),
      name: String(row[index("name")] ?? ""),
      exchange: String(row[index("exchange")] ?? "").toUpperCase(),
    }));

    const candidatesResult = await pool.query<SecSmallcapCandidate>(`
      SELECT u.market, UPPER(u.code) AS ticker, u.name,
             f.market_cap AS "marketCapUsd", f.price AS "priceUsd"
        FROM us_common_stock_universe u
        JOIN instrument_fundamental_snapshots f USING (market, code)
       WHERE u.enabled = TRUE AND u.daily_active = TRUE
         AND u.instrument_type = 'COMMON_STOCK'
         AND COALESCE(u.is_etf, FALSE) = FALSE AND COALESCE(u.is_warrant, FALSE) = FALSE
         AND COALESCE(u.is_derivative, FALSE) = FALSE AND COALESCE(u.is_dr, FALSE) = FALSE
         AND COALESCE(u.is_leveraged, FALSE) = FALSE AND COALESCE(u.is_inverse, FALSE) = FALSE
         AND u.market IN ('NAS','NASDAQ','NYS','NYSE','AMS','AMEX')
         AND f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap < 100000000
       ORDER BY f.market_cap ASC, u.market, u.code
    `);

    const tickerRows = new Map<string, typeof secRows>();
    for (const row of secRows) tickerRows.set(row.ticker, [...(tickerRows.get(row.ticker) ?? []), row]);

    const eligible: Array<{ candidate: SecSmallcapCandidate; cik: string; companyName: string }> = [];
    let unmatchedCount = 0;
    for (const candidate of candidatesResult.rows) {
      if (!isSecEligibleSmallcapCandidate(candidate)) continue;
      const mapped = (tickerRows.get(candidate.ticker) ?? []).filter((row) => {
        const market = candidate.market.toUpperCase();
        if (market === "NAS" || market === "NASDAQ") return row.exchange.includes("NASDAQ");
        if (market === "NYS" || market === "NYSE") return row.exchange === "NYSE";
        return row.exchange.includes("NYSE AMERICAN") || row.exchange === "AMEX";
      });
      if (new Set(mapped.map((row) => row.cik)).size !== 1 || !/^\d{10}$/.test(mapped[0]?.cik ?? "")) {
        unmatchedCount += 1;
        continue;
      }
      eligible.push({ candidate, cik: mapped[0].cik, companyName: mapped[0].name || candidate.name });
    }

    let savedCount = 0;
    let missingFacts = 0;
    let failedCount = 0;
    for (const { candidate, cik, companyName } of eligible) {
      try {
        const response = await fetchCompanyFactsWithRetry(cik);
        if (!response.ok) throw new Error(`SEC Company Facts HTTP ${response.status}`);
        const facts = selectSecSharesFacts(response.data);
        if (!facts.dei && !facts.usGaap) { missingFacts += 1; continue; }
        await pool.query(`
          INSERT INTO sec_smallcap_common_stock_shares
            (market, ticker, cik, company_name, market_cap_usd, price_usd,
             dei_shares_outstanding, dei_fact_end_date, dei_fact_filed_date, dei_fact_form, dei_fact_accession_number,
             us_gaap_shares_outstanding, us_gaap_fact_end_date, us_gaap_fact_filed_date, us_gaap_fact_form, us_gaap_fact_accession_number,
             source_url, fetched_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13::date,$14::date,$15,$16,$17,$18::timestamptz,NOW())
          ON CONFLICT (market, ticker) DO UPDATE SET
            cik=EXCLUDED.cik, company_name=EXCLUDED.company_name, market_cap_usd=EXCLUDED.market_cap_usd,
            price_usd=EXCLUDED.price_usd,
            dei_shares_outstanding=EXCLUDED.dei_shares_outstanding, dei_fact_end_date=EXCLUDED.dei_fact_end_date,
            dei_fact_filed_date=EXCLUDED.dei_fact_filed_date, dei_fact_form=EXCLUDED.dei_fact_form,
            dei_fact_accession_number=EXCLUDED.dei_fact_accession_number,
            us_gaap_shares_outstanding=EXCLUDED.us_gaap_shares_outstanding,
            us_gaap_fact_end_date=EXCLUDED.us_gaap_fact_end_date, us_gaap_fact_filed_date=EXCLUDED.us_gaap_fact_filed_date,
            us_gaap_fact_form=EXCLUDED.us_gaap_fact_form, us_gaap_fact_accession_number=EXCLUDED.us_gaap_fact_accession_number,
            source_url=EXCLUDED.source_url, fetched_at=EXCLUDED.fetched_at, updated_at=NOW()
        `, [candidate.market, candidate.ticker, cik, companyName, candidate.marketCapUsd, candidate.priceUsd,
          facts.dei?.shares ?? null, facts.dei?.end ?? null, facts.dei?.filed ?? null, facts.dei?.form ?? null, facts.dei?.accessionNumber ?? null,
          facts.usGaap?.shares ?? null, facts.usGaap?.end ?? null, facts.usGaap?.filed ?? null, facts.usGaap?.form ?? null, facts.usGaap?.accessionNumber ?? null,
          response.url, response.fetchedAt]);
        savedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.warn(JSON.stringify({ ticker: candidate.ticker, market: candidate.market, error: error instanceof Error ? error.message : String(error) }));
      }
    }

    return {
      ok: failedCount === 0,
      sourceConcepts: ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"],
      candidateCount: candidatesResult.rowCount ?? candidatesResult.rows.length,
      secMatchedCount: eligible.length,
      unmatchedCount,
      savedCount,
      missingFacts,
      failedCount,
      failureCount: failedCount,
      instrumentCount: eligible.length,
    };
  } finally {
    if (locked) await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_CLASS, LOCK_ID]).catch(() => undefined);
    lockClient.release();
  }
}
