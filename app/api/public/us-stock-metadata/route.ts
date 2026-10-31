import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { summarizeSecCompanyFacts } from "@/lib/us-company-facts-summary";

export const dynamic = "force-dynamic";

const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const US_MARKETS = ["NAS", "NYS", "AMS"];
const MARKET_SNAPSHOT_FRESHNESS_SECONDS = 24 * 60 * 60;

type MetadataRow = {
  market: string;
  code: string;
  realtime_symbol: string | null;
  name: string;
  english_name: string;
  instrument_type: string;
  security_type: string;
  etp_type: string;
  currency: string;
  country_code: string;
  industry_code: string;
  is_etf: boolean;
  is_leveraged: boolean;
  is_inverse: boolean;
  is_warrant: boolean;
  is_derivative: boolean;
  is_dr: boolean;
  enabled: boolean;
  source_file: string;
  master_updated_at: Date | string;
  master_last_seen_at: Date | string;
  cik: string | null;
  sec_name: string | null;
  sic: string | null;
  sec_identity_source: string | null;
  sec_source_updated_at: Date | string | null;
  xbrl_payload: unknown;
  xbrl_fetched_at: Date | string | null;
  price: number | null;
  change_rate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  trading_value: number | null;
  market_cap: number | null;
  listed_shares: number | null;
  snapshot_currency: string | null;
  quote_source: string | null;
  observed_at: Date | string | null;
  fetched_at: Date | string | null;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!TICKER_PATTERN.test(ticker)) return errorResponse("INVALID_TICKER", 400);

  try {
    const result = await getPool().query<MetadataRow>(
      `SELECT u.market, UPPER(u.code) AS code, NULLIF(u.realtime_symbol, '') AS realtime_symbol,
              u.name, u.english_name, u.instrument_type, u.security_type, u.etp_type,
              u.currency, u.country_code, u.industry_code, u.is_etf, u.is_leveraged,
              u.is_inverse, u.is_warrant, u.is_derivative, u.is_dr, u.enabled, u.source_file,
              u.updated_at AS master_updated_at, u.last_seen_at AS master_last_seen_at,
              COALESCE(sec.cik, sic_source.cik) AS cik,
              COALESCE(sec.name, x.payload->>'entityName') AS sec_name,
              COALESCE(sec.sic, CASE WHEN sic_source.cik IS NOT NULL THEN u.industry_code END) AS sic,
              CASE WHEN sec.cik IS NOT NULL THEN 'SEC_COMPANY_TICKER_EXCHANGE_MASTER'
                   WHEN sic_source.cik IS NOT NULL THEN 'SEC_EDGAR_SIC_SOURCE'
                   ELSE NULL END AS sec_identity_source,
              COALESCE(sec.source_updated_at, x.fetched_at) AS sec_source_updated_at,
              x.payload AS xbrl_payload, x.fetched_at AS xbrl_fetched_at,
              f.price, f.change_rate, f.open, f.high, f.low, f.volume, f.trading_value,
              f.market_cap, f.listed_shares, f.currency AS snapshot_currency,
              f.source AS quote_source, f.observed_at, f.fetched_at
         FROM us_common_stock_universe u
         LEFT JOIN instrument_fundamental_snapshots f
           ON f.market = u.market AND f.code = u.code
         LEFT JOIN LATERAL (
           SELECT c.cik, c.name, c.sic, c.source_updated_at
             FROM sec_companies c
            WHERE EXISTS (
              SELECT 1 FROM unnest(c.tickers) AS sec_ticker(ticker)
               WHERE UPPER(sec_ticker.ticker) = UPPER(u.code)
            )
            ORDER BY c.updated_at DESC
            LIMIT 1
         ) sec ON TRUE
         LEFT JOIN LATERAL (
           SELECT substring(u.source_file FROM '^SEC_EDGAR_SIC:([0-9]{10})$') AS cik
         ) sic_source ON TRUE
         LEFT JOIN sec_xbrl_snapshots x ON x.cik = COALESCE(sec.cik, sic_source.cik)
        WHERE UPPER(u.code) = $1 AND u.market = ANY($2::text[])
        ORDER BY u.market`,
      [ticker, US_MARKETS],
    );

    if (result.rowCount === 0) {
      const special = await getPool().query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM us_special_instrument_universe
            WHERE UPPER(code) = $1 AND market = ANY($2::text[])
         ) AS exists`,
        [ticker, US_MARKETS],
      );
      return special.rows[0]?.exists
        ? errorResponse("NOT_ACTIVE_COMMON_STOCK", 422)
        : errorResponse("INSTRUMENT_NOT_FOUND", 404);
    }
    if (result.rowCount !== 1) return errorResponse("AMBIGUOUS_TICKER", 409);

    const row = result.rows[0];
    if (row.instrument_type !== "COMMON_STOCK" || row.enabled !== true) return errorResponse("NOT_ACTIVE_COMMON_STOCK", 422);
    if (row.is_etf !== false || row.is_warrant !== false || row.is_derivative !== false || row.is_dr !== false || row.is_leveraged !== false || row.is_inverse !== false) {
      return errorResponse("NOT_ACTIVE_COMMON_STOCK", 422);
    }

    const financialFacts = row.xbrl_payload == null
      ? null
      : summarizeSecCompanyFacts(row.xbrl_payload, row.snapshot_currency || row.currency || null);
    const financialMetricValues = financialFacts ? Object.values(financialFacts.metrics) : [];
    const availableFinancialMetricCount = financialMetricValues.filter((value) => value !== null).length;
    const missingFinancialMetrics = financialFacts
      ? Object.entries(financialFacts.metrics).filter(([, value]) => value === null).map(([name]) => name)
      : ["revenue", "operatingIncome", "netIncome", "cashAndCashEquivalents", "operatingCashFlow"];
    const missingGroups: string[] = [];
    if (!row.cik) missingGroups.push("sec_company_identity");
    if (row.price == null) missingGroups.push("market_snapshot");
    if (availableFinancialMetricCount === 0) missingGroups.push("sec_company_facts");
    else if (missingFinancialMetrics.length > 0) missingGroups.push("financial_metrics");
    const asOf = new Date().toISOString();
    const observedAtMs = row.observed_at == null ? NaN : new Date(row.observed_at).getTime();
    const marketDataAgeSeconds = Number.isFinite(observedAtMs)
      ? Math.max(0, Math.floor((Date.now() - observedAtMs) / 1000))
      : null;
    const marketDataFreshness = row.price == null
      ? "MISSING"
      : marketDataAgeSeconds == null
        ? "UNKNOWN"
        : marketDataAgeSeconds <= MARKET_SNAPSHOT_FRESHNESS_SECONDS ? "FRESH" : "STALE";

    return NextResponse.json({
      ok: true,
      schemaVersion: "us-stock-metadata.v1",
      asOf,
      ticker: row.code,
      identity: {
        market: row.market,
        ticker: row.code,
        realtimeSymbol: row.realtime_symbol,
        name: row.name || null,
        englishName: row.english_name || null,
        exchangeName: row.market === "NAS" ? "NASDAQ" : row.market === "NYS" ? "NYSE" : "NYSE American",
        currency: row.currency || row.snapshot_currency || null,
        countryCode: row.country_code || null,
        industryCode: row.industry_code || null,
        instrumentType: row.instrument_type,
        securityType: row.security_type || null,
        etpType: row.etp_type || null,
        isCommonStock: true,
        classification: {
          isEtf: row.is_etf,
          isWarrant: row.is_warrant,
          isDerivative: row.is_derivative,
          isDr: row.is_dr,
          isLeveraged: row.is_leveraged,
          isInverse: row.is_inverse,
          masterUpdatedAt: row.master_updated_at,
          lastSeenAt: row.master_last_seen_at,
          source: row.source_file,
        },
      },
      company: {
        cik: row.cik,
        secName: row.sec_name,
        sic: row.sic,
        source: row.sec_identity_source,
        sourceUpdatedAt: row.sec_source_updated_at || (row.sec_identity_source === "SEC_EDGAR_SIC_SOURCE" ? row.master_updated_at : null),
      },
      financials: financialFacts ? {
        source: "SEC_COMPANY_FACTS",
        sourceUrl: row.cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(row.cik).replace(/\D/g, "").padStart(10, "0")}.json` : null,
        fetchedAt: row.xbrl_fetched_at,
        entityName: financialFacts.entityName,
        availableMetricCount: availableFinancialMetricCount,
        missingMetrics: missingFinancialMetrics,
        metrics: financialFacts.metrics,
      } : null,
      marketSnapshot: {
        price: row.price,
        changeRate: row.change_rate,
        open: row.open,
        high: row.high,
        low: row.low,
        volume: row.volume,
        tradingValue: row.trading_value,
        marketCap: row.market_cap,
        listedShares: row.listed_shares,
        currency: row.snapshot_currency || row.currency || null,
        source: row.quote_source,
        observedAt: row.observed_at,
        fetchedAt: row.fetched_at,
      },
      dataQuality: {
        status: missingGroups.length === 0 ? "COMPLETE" : "PARTIAL",
        missingGroups,
        marketDataFreshness,
        marketDataAgeSeconds,
        freshnessThresholdSeconds: MARKET_SNAPSHOT_FRESHNESS_SECONDS,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /public/us-stock-metadata] Error:", error instanceof Error ? error.message : "unknown error");
    return errorResponse("US_STOCK_METADATA_UNAVAILABLE", 503);
  }
}
