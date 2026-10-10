import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { consumeSecCompanyFactsPublicLimit } from "@/lib/sec-company-facts-public-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKET_CAP_USD = 100_000_000;
const ALLOWED_MARKETS = new Set(["NAS", "NASDAQ", "NYS", "NYSE", "AMS", "AMEX"]);
const TICKER_PATTERN = /^[A-Z][A-Z0-9./-]{0,14}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

type PageCursor = { version: 1; marketCapUsd: number; market: string; ticker: string };

function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
}

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false, error: "RATE_LIMITED", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}

function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): PageCursor | null | "invalid" {
  if (!value) return null;
  if (value.length > 512) return "invalid";
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PageCursor>;
    const market = String(parsed.market ?? "").toUpperCase();
    const ticker = String(parsed.ticker ?? "").toUpperCase();
    const marketCapUsd = Number(parsed.marketCapUsd);
    if (parsed.version !== 1 || !Number.isFinite(marketCapUsd) || marketCapUsd <= 0 || marketCapUsd > MAX_MARKET_CAP_USD
      || !ALLOWED_MARKETS.has(market) || !TICKER_PATTERN.test(ticker)) return "invalid";
    return { version: 1, marketCapUsd, market, ticker };
  } catch {
    return "invalid";
  }
}

function optionalFact(row: Record<string, unknown>, prefix: "dei" | "us_gaap") {
  const shares = row[`${prefix}_shares_outstanding`];
  if (shares == null) return null;
  return {
    sharesOutstanding: String(shares),
    asOfDate: row[`${prefix}_fact_end_date`],
    filedDate: row[`${prefix}_fact_filed_date`],
    form: row[`${prefix}_fact_form`],
    accessionNumber: row[`${prefix}_fact_accession_number`],
  };
}

export async function GET(request: Request) {
  const limitResult = consumeSecCompanyFactsPublicLimit("read", clientIp(request));
  if (!limitResult.allowed) return rateLimited(limitResult.retryAfterSeconds);

  const params = new URL(request.url).searchParams;
  const rawTicker = params.get("ticker")?.trim().toUpperCase() ?? "";
  const rawMarket = params.get("market")?.trim().toUpperCase() ?? "";
  const rawLimit = params.get("limit");
  const limit = rawLimit === null || rawLimit === "" ? DEFAULT_LIMIT : Number(rawLimit);
  const cursor = decodeCursor(params.get("cursor"));

  if (rawTicker && !TICKER_PATTERN.test(rawTicker)) {
    return NextResponse.json({ ok: false, error: "INVALID_TICKER" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (rawMarket && !ALLOWED_MARKETS.has(rawMarket)) {
    return NextResponse.json({ ok: false, error: "INVALID_MARKET", allowed: [...ALLOWED_MARKETS] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT", allowed: [1, MAX_LIMIT] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (cursor === "invalid" || (rawTicker && cursor)) {
    return NextResponse.json({ ok: false, error: cursor === "invalid" ? "INVALID_CURSOR" : "CURSOR_NOT_ALLOWED_WITH_TICKER" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT u.market,
              UPPER(u.code) AS ticker,
              COALESCE(NULLIF(u.name, ''), s.company_name) AS company_name,
              f.market_cap AS current_market_cap_usd,
              f.price AS current_price_usd,
              f.fetched_at AS fundamentals_fetched_at,
              s.cik,
              s.market_cap_usd AS facts_market_cap_usd,
              s.price_usd AS facts_price_usd,
              s.dei_shares_outstanding,
              TO_CHAR(s.dei_fact_end_date, 'YYYY-MM-DD') AS dei_fact_end_date,
              TO_CHAR(s.dei_fact_filed_date, 'YYYY-MM-DD') AS dei_fact_filed_date,
              s.dei_fact_form,
              s.dei_fact_accession_number,
              s.us_gaap_shares_outstanding,
              TO_CHAR(s.us_gaap_fact_end_date, 'YYYY-MM-DD') AS us_gaap_fact_end_date,
              TO_CHAR(s.us_gaap_fact_filed_date, 'YYYY-MM-DD') AS us_gaap_fact_filed_date,
              s.us_gaap_fact_form,
              s.us_gaap_fact_accession_number,
              s.source_url,
              s.fetched_at AS sec_fetched_at,
              s.updated_at,
              r.review_status,
              r.shares_outstanding AS reviewed_shares_outstanding,
              TO_CHAR(r.as_of_date, 'YYYY-MM-DD') AS reviewed_as_of_date,
              r.filing_form AS reviewed_filing_form,
              TO_CHAR(r.filing_date, 'YYYY-MM-DD') AS reviewed_filing_date,
              r.accession_number AS reviewed_accession_number,
              r.source_url AS reviewed_source_url,
              r.reviewed_at
         FROM us_common_stock_universe u
         JOIN instrument_fundamental_snapshots f
           ON f.market = u.market AND f.code = u.code
         JOIN sec_smallcap_common_stock_shares s
           ON s.market = u.market AND s.ticker = UPPER(u.code)
         LEFT JOIN sec_smallcap_share_review r
           ON r.market = u.market AND r.ticker = UPPER(u.code)
        WHERE u.enabled = TRUE AND u.daily_active = TRUE
          AND u.instrument_type = 'COMMON_STOCK'
          AND COALESCE(u.is_etf, FALSE) = FALSE AND COALESCE(u.is_warrant, FALSE) = FALSE
          AND COALESCE(u.is_derivative, FALSE) = FALSE AND COALESCE(u.is_dr, FALSE) = FALSE
          AND COALESCE(u.is_leveraged, FALSE) = FALSE AND COALESCE(u.is_inverse, FALSE) = FALSE
          AND u.market IN ('NAS','NASDAQ','NYS','NYSE','AMS','AMEX')
          AND f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap <= $1
          AND (s.dei_shares_outstanding IS NOT NULL OR s.us_gaap_shares_outstanding IS NOT NULL)
          AND ($2::text IS NULL OR UPPER(u.code) = $2)
          AND ($3::text IS NULL OR u.market = $3)
          AND ($4::double precision IS NULL OR ROW(f.market_cap, u.market, UPPER(u.code)) > ROW($4::double precision, $5::text, $6::text))
        ORDER BY f.market_cap ASC, u.market ASC, UPPER(u.code) ASC
        LIMIT $7`,
      [MAX_MARKET_CAP_USD, rawTicker || null, rawMarket || null, cursor?.marketCapUsd ?? null, cursor?.market ?? null, cursor?.ticker ?? null, limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items = rows.map((row) => {
      const dei = optionalFact(row, "dei");
      const usGaap = optionalFact(row, "us_gaap");
      const deiFiled = dei?.filedDate == null ? "" : String(dei.filedDate);
      const gaapFiled = usGaap?.filedDate == null ? "" : String(usGaap.filedDate);
      const selectedFact = dei && (!usGaap || deiFiled >= gaapFiled)
        ? { taxonomy: "dei:EntityCommonStockSharesOutstanding", ...dei }
        : usGaap ? { taxonomy: "us-gaap:CommonStockSharesOutstanding", ...usGaap } : null;
      const reviewedDate = row.reviewed_as_of_date == null ? "" : String(row.reviewed_as_of_date);
      const reviewedAsOf = reviewedDate ? new Date(`${reviewedDate}T00:00:00Z`) : null;
      const staleCutoff = new Date();
      staleCutoff.setUTCFullYear(staleCutoff.getUTCFullYear() - 1);
      const reviewIsFresh = row.review_status === "VERIFIED"
        && row.reviewed_shares_outstanding != null
        && reviewedAsOf !== null
        && reviewedAsOf >= staleCutoff;
      return {
        market: row.market,
        ticker: row.ticker,
        companyName: row.company_name,
        currency: "USD",
        marketCapUsd: row.current_market_cap_usd,
        priceUsd: row.current_price_usd,
        fundamentalsFetchedAt: row.fundamentals_fetched_at,
        sharesOutstanding: selectedFact,
        facts: { dei, usGaap },
        reviewedSharesOutstanding: {
          status: row.review_status ?? "UNAVAILABLE",
          sharesOutstanding: reviewIsFresh ? String(row.reviewed_shares_outstanding) : null,
          asOfDate: reviewedDate || null,
          filedDate: row.reviewed_filing_date ?? null,
          form: row.reviewed_filing_form ?? null,
          accessionNumber: row.reviewed_accession_number || null,
          sourceUrl: row.reviewed_source_url || null,
          reviewedAt: row.reviewed_at ?? null,
          isFresh: reviewIsFresh,
          note: row.review_status === "REVIEW_REQUIRED"
            ? "검토 필요: 확인된 검증 주식수를 제공하지 않습니다."
            : row.review_status === "VERIFIED" && !reviewIsFresh
              ? "검증 기준일이 1년을 초과하여 주식수를 제공하지 않습니다."
              : null,
        },
        secCompanyFacts: {
          cik: row.cik,
          url: row.source_url,
          fetchedAt: row.sec_fetched_at,
          updatedAt: row.updated_at,
          marketCapUsdAtFetch: row.facts_market_cap_usd,
          priceUsdAtFetch: row.facts_price_usd,
        },
      };
    });
    const last = rows.at(-1);
    const nextCursor = hasMore && last
      ? encodeCursor({ version: 1, marketCapUsd: Number(last.current_market_cap_usd), market: String(last.market), ticker: String(last.ticker) })
      : null;

    return NextResponse.json({
      ok: true,
      source: "SEC_COMPANY_FACTS_AND_STOCKMAN_DB",
      checkedAt: new Date().toISOString(),
      criteria: { securityType: "ACTIVE_COMMON_STOCK", marketCapCurrency: "USD", maximumMarketCapUsd: MAX_MARKET_CAP_USD, maximumInclusive: true },
      filters: { ticker: rawTicker || null, market: rawMarket || null, limit },
      items,
      pagination: { returnedCount: items.length, hasMore, nextCursor },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API /public/us-smallcap-shares] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "US_SMALLCAP_SHARES_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
