import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE_COMMON = `
  u.enabled = TRUE AND u.daily_active = TRUE
  AND u.instrument_type = 'COMMON_STOCK'
  AND u.security_type = '2' AND u.country_code = 'US' AND u.currency = 'USD'
  AND u.market IN ('NAS', 'NYS', 'AMS')
  AND u.is_etf = FALSE AND u.is_leveraged = FALSE AND u.is_inverse = FALSE
  AND u.is_warrant = FALSE AND u.is_derivative = FALSE AND u.is_dr = FALSE
`;

/** Read-only one-month turnover aggregation by source taxonomy and stored industry code. */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await getPool().query(`
      WITH eligible AS (
        SELECT u.market, u.code,
          CASE WHEN u.source_file LIKE 'SEC_EDGAR_SIC:%' THEN 'SEC_SIC' ELSE 'KIS_ICOD' END AS classification_source,
          NULLIF(BTRIM(u.industry_code), '') AS industry_code
        FROM us_common_stock_universe u
        WHERE ${ELIGIBLE_COMMON}
      ), latest AS (
        SELECT MAX(c.candle_date)::date AS latest_date
        FROM us_latest_daily_candles c
        WHERE c.market IN ('NAS', 'NYS', 'AMS') AND c.volume > 0
      ), period AS (
        SELECT latest_date, (latest_date - INTERVAL '1 month')::date AS start_date FROM latest
      ), candle_rows AS (
        SELECT e.market, e.code, e.classification_source,
          COALESCE(e.industry_code, 'UNCLASSIFIED') AS industry_code,
          c.candle_date::date AS date, c.trading_value, c.close, c.volume
        FROM eligible e
        CROSS JOIN period p
        JOIN us_instrument_universe_candles c
          ON c.market = e.market AND c.code = e.code AND c.timeframe = 'D'
          AND c.candle_date BETWEEN TO_CHAR(p.start_date, 'YYYYMMDD') AND TO_CHAR(p.latest_date, 'YYYYMMDD')
          AND c.volume > 0 AND c.close > 0
      ), daily AS (
        SELECT date, classification_source, industry_code,
          COUNT(DISTINCT (market, code))::int AS ticker_count,
          COUNT(DISTINCT (market, code)) FILTER (WHERE trading_value > 0)::int AS reported_turnover_ticker_count,
          SUM(COALESCE(NULLIF(trading_value, 0), close * volume)) AS trading_value_usd,
          COUNT(*) FILTER (WHERE trading_value > 0)::int AS reported_turnover_rows,
          COUNT(*) FILTER (WHERE trading_value IS NULL OR trading_value = 0)::int AS close_volume_fallback_rows
        FROM candle_rows
        GROUP BY date, classification_source, industry_code
      ), summary AS (
        SELECT classification_source, industry_code,
          SUM(trading_value_usd) AS period_trading_value_usd,
          COUNT(DISTINCT date)::int AS trading_days,
          MAX(ticker_count)::int AS max_daily_ticker_count,
          SUM(reported_turnover_rows)::int AS reported_turnover_rows,
          SUM(close_volume_fallback_rows)::int AS close_volume_fallback_rows
        FROM daily GROUP BY classification_source, industry_code
      )
      SELECT json_build_object(
        'latestDate', p.latest_date,
        'startDate', p.start_date,
        'eligibleCommonCount', (SELECT COUNT(*)::int FROM eligible),
        'eligibleClassifiedCount', (SELECT COUNT(*)::int FROM eligible WHERE industry_code IS NOT NULL),
        'eligibleUnclassifiedCount', (SELECT COUNT(*)::int FROM eligible WHERE industry_code IS NULL),
        'eligibleWithPeriodCandlesCount', (SELECT COUNT(DISTINCT (market, code))::int FROM candle_rows),
        'summary', COALESCE((SELECT json_agg(to_jsonb(s) ORDER BY s.period_trading_value_usd DESC)
          FROM summary s), '[]'::json),
        'daily', COALESCE((SELECT json_agg(to_jsonb(d) ORDER BY d.date, d.classification_source, d.industry_code)
          FROM daily d), '[]'::json)
      ) AS report
      FROM period p
    `);
    const report = result.rows[0]?.report;
    if (!report?.latestDate) {
      return NextResponse.json({ ok: false, error: "US_DAILY_CANDLES_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      source: "OPERATING_DB_READ_ONLY_AGGREGATION",
      currency: "USD",
      turnoverFallback: "close × volume when stored trading_value is absent or zero",
      taxonomyNote: "KIS ICOD and SEC SIC are separate code systems; codes are not merged across taxonomies.",
      ...report,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "US_INDUSTRY_TURNOVER_UNAVAILABLE" }, { status: 503 });
  }
}
