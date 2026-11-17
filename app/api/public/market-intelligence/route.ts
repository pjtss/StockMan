import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function isoDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ticker = (params.get("ticker") ?? "").trim().toUpperCase();
  const from = isoDate(params.get("from"));
  const to = isoDate(params.get("to"));
  const rawLimit = params.get("limit");
  const limit = rawLimit === null || rawLimit.trim() === "" ? 50 : (/^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN);
  if (ticker && !/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) return NextResponse.json({ ok: false, error: "INVALID_TICKER" }, { status: 400 });
  if (params.has("from") && !from || params.has("to") && !to || from && to && from >= to) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
  try {
    const pool = getPool();
    const tickerParam = ticker || null;
    const fromParam = from ? from.toISOString() : null;
    const toParam = to ? new Date(to.getTime() + 86_400_000).toISOString() : null;
    const [universe, fundamentals, rss, bullish, sec] = await Promise.all([
      pool.query(`SELECT market, code, name, english_name, instrument_type, security_type, enabled, is_etf, is_warrant, is_derivative, is_dr FROM us_common_stock_universe WHERE ($1::text IS NOT NULL AND UPPER(code) = $1) AND enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND is_etf = FALSE AND is_warrant = FALSE AND is_derivative = FALSE AND is_dr = FALSE AND is_leveraged = FALSE AND is_inverse = FALSE ORDER BY market`, [tickerParam]),
      pool.query(`SELECT f.market, f.code, f.name, f.price, f.change_rate, f.open, f.high, f.low, f.volume, f.trading_value, f.market_cap, f.listed_shares, f.currency, f.source, f.observed_at, f.fetched_at FROM instrument_fundamental_snapshots f JOIN us_common_stock_universe u ON u.market = f.market AND UPPER(u.code) = UPPER(f.code) WHERE ($1::text IS NOT NULL AND UPPER(f.code) = $1) AND u.enabled = TRUE AND u.instrument_type = 'COMMON_STOCK' AND u.is_etf = FALSE AND u.is_warrant = FALSE AND u.is_derivative = FALSE AND u.is_dr = FALSE AND u.is_leveraged = FALSE AND u.is_inverse = FALSE ORDER BY f.fetched_at DESC, f.market, f.code LIMIT 1`, [tickerParam]),
      pool.query(`SELECT source, external_id, title, summary, content, link, detected_ticker, event_direction, matched_terms, financing_amount_usd, dilution_risk, category, priority, published_at, updated_at FROM market_rss_articles WHERE ($1::text IS NULL OR UPPER(detected_ticker) = $1) AND ($2::timestamptz IS NULL OR published_at >= $2) AND ($3::timestamptz IS NULL OR published_at < $3) ORDER BY published_at DESC NULLS LAST, id DESC LIMIT $4`, [tickerParam, fromParam, toParam, limit]),
      pool.query(`SELECT source, external_id, title, translated_title, summary, translated_summary, content, link, ticker, category, direction, matched_terms, priority, financing_amount_usd, dilution_risk, published_at, analyzed_at FROM market_rss_bullish_articles WHERE ($1::text IS NULL OR UPPER(ticker) = $1) AND ($2::timestamptz IS NULL OR published_at >= $2) AND ($3::timestamptz IS NULL OR published_at < $3) ORDER BY published_at DESC NULLS LAST, priority DESC, id DESC LIMIT $4`, [tickerParam, fromParam, toParam, limit]),
      pool.query(`SELECT c.tickers, c.name, e.accession, s.form, s.filing_date, s.report_date, s.items, s.primary_document, s.filing_url, e.category, e.direction, e.score, e.matched_terms, e.body_excerpt, e.financing_amount_usd, e.dilution_risk, e.insider_action, e.updated_at FROM sec_companies c JOIN sec_filing_events e ON e.cik = c.cik JOIN sec_submissions s ON s.accession = e.accession WHERE ($1::text IS NULL OR $1 = ANY(c.tickers)) AND ($2::date IS NULL OR s.filing_date >= $2::date) AND ($3::date IS NULL OR s.filing_date < $3::date) ORDER BY s.filing_date DESC, e.score DESC LIMIT $4`, [tickerParam, params.get("from") ?? null, params.get("to") ?? null, limit]),
    ]);
    if (universe.rows.length > 1) return NextResponse.json({ ok: false, error: "AMBIGUOUS_TICKER" }, { status: 409, headers: { "cache-control": "no-store" } });
    const fundamental = fundamentals.rows[0] ?? null;
    const observedAtMs = fundamental?.observed_at == null ? NaN : new Date(fundamental.observed_at).getTime();
    const marketDataAgeSeconds = Number.isFinite(observedAtMs) ? Math.max(0, Math.floor((Date.now() - observedAtMs) / 1000)) : null;
    const marketDataFreshness = !fundamental || fundamental.price == null ? "MISSING" : marketDataAgeSeconds == null ? "UNKNOWN" : marketDataAgeSeconds <= FUNDAMENTAL_FRESHNESS_SECONDS ? "FRESH" : "STALE";
    return NextResponse.json({ ok: true, query: { ticker: ticker || null, from: params.get("from") || null, to: params.get("to") || null, limit }, asOf: new Date().toISOString(), instrument: universe.rows[0] ?? null, fundamental: fundamental ? { ...fundamental, marketDataFreshness, marketDataAgeSeconds, freshnessThresholdSeconds: FUNDAMENTAL_FRESHNESS_SECONDS } : null, rssArticles: rss.rows, bullishArticles: bullish.rows, secEvents: sec.rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /public/market-intelligence] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "MARKET_INTELLIGENCE_UNAVAILABLE" }, { status: 503 });
  }
}
