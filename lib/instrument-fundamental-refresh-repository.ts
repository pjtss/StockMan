import { isInstrumentFundamentalRefreshComplete, type InstrumentFundamentalRefreshCounts } from "./instrument-fundamental-refresh-integrity";
import { instrumentFundamentalKisTurnoverSql } from "./instrument-fundamental-kis-turnover-sql";

export type RefreshQueryExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type RefreshUniverseRow = { market: string; code: string; name: string; source: string };
export type MissingRefreshRow = { market: string; code: string };
export type InvalidRefreshRow = { market: string; code: string; reason: string };

export async function loadInstrumentFundamentalUniverse(db: RefreshQueryExecutor) {
  const result = await db.query(`
    SELECT market,code,name,'kr_common_stock_universe'::text AS source
    FROM kr_common_stock_universe WHERE enabled=true
    UNION ALL
    SELECT market,code,name,'us_common_stock_universe'::text AS source
    FROM us_common_stock_universe WHERE enabled=true
    ORDER BY market,code,source
  `);
  return result.rows as RefreshUniverseRow[];
}

export async function loadMissingInstrumentFundamentals(db: RefreshQueryExecutor, since: Date) {
  const result = await db.query(`
    WITH active AS (
      SELECT market,code FROM kr_common_stock_universe WHERE enabled=true
      UNION ALL
      SELECT market,code FROM us_common_stock_universe WHERE enabled=true
    ), refreshed AS (
      SELECT DISTINCT market,code FROM instrument_fundamental_history WHERE fetched_at >= $1::timestamptz
    )
    SELECT a.market,a.code FROM active a
    LEFT JOIN refreshed r USING (market,code)
    WHERE r.code IS NULL
    ORDER BY a.market,a.code
  `, [since.toISOString()]);
  return result.rows as MissingRefreshRow[];
}

export async function loadInvalidInstrumentFundamentals(db: RefreshQueryExecutor, since: Date) {
  const turnoverSql = instrumentFundamentalKisTurnoverSql("h.raw_payload");
  const result = await db.query(`
    WITH active AS (
      SELECT market,code FROM kr_common_stock_universe WHERE enabled=true
      UNION ALL
      SELECT market,code FROM us_common_stock_universe WHERE enabled=true
    ), latest AS (
      SELECT DISTINCT ON (h.market,h.code) h.*
      FROM instrument_fundamental_history h
      JOIN active a USING (market,code)
      WHERE h.fetched_at >= $1::timestamptz
      ORDER BY h.market,h.code,h.fetched_at DESC,h.id DESC
    ), evaluated AS (
      SELECT a.market,a.code,
        CASE
          WHEN h.code IS NULL THEN 'missing_history'
          WHEN h.price IS NULL OR h.price <= 0 THEN 'invalid_price'
          WHEN h.market_cap IS NULL OR h.market_cap <= 0 THEN 'invalid_market_cap'
          WHEN h.trading_value IS NULL THEN 'missing_turnover'
          WHEN h.market IN ('AMS','NAS','NYS') AND h.trading_value IS DISTINCT FROM ${turnoverSql} THEN 'overseas_turnover_source_mismatch'
        END AS reason
      FROM active a
      LEFT JOIN latest h USING (market,code)
    )
    SELECT market,code,reason FROM evaluated WHERE reason IS NOT NULL ORDER BY market,code
  `, [since.toISOString()]);
  return result.rows as InvalidRefreshRow[];
}

export async function verifyInstrumentFundamentalRefresh(db: RefreshQueryExecutor, since: Date) {
  const timestamp = since.toISOString();
  const turnoverSql = instrumentFundamentalKisTurnoverSql("raw_payload");
  const verification = await db.query(`
    WITH active AS (
      SELECT market,code FROM kr_common_stock_universe WHERE enabled=true
      UNION ALL
      SELECT market,code FROM us_common_stock_universe WHERE enabled=true
    ), refreshed AS (
      SELECT DISTINCT market,code FROM instrument_fundamental_history WHERE fetched_at >= $1::timestamptz
    ), saved AS (
      SELECT DISTINCT ON (h.market,h.code) h.* FROM instrument_fundamental_history h
      JOIN active a USING (market,code)
      WHERE h.fetched_at >= $1::timestamptz
      ORDER BY h.market,h.code,h.fetched_at DESC,h.id DESC
    )
    SELECT (SELECT count(*)::int FROM active) AS active_instruments,
      (SELECT count(*)::int FROM active a JOIN refreshed r USING (market,code)) AS refreshed_active_instruments,
      (SELECT count(*)::int FROM active a LEFT JOIN refreshed r USING (market,code) WHERE r.code IS NULL) AS missing_active_instruments,
      (SELECT count(*)::int FROM saved) AS history_rows,
      (SELECT count(DISTINCT (market,code))::int FROM saved) AS instruments,
      (SELECT count(*) FILTER (WHERE trading_value IS NOT NULL)::int FROM saved) AS turnover_rows,
      (SELECT count(*) FILTER (WHERE trading_value > 0)::int FROM saved) AS turnover_positive_rows,
      (SELECT count(*) FILTER (WHERE trading_value = 0)::int FROM saved) AS turnover_zero_rows,
      (SELECT count(*) FILTER (WHERE s.market_cap IS DISTINCT FROM saved.market_cap)::int
        FROM saved LEFT JOIN instrument_fundamental_snapshots s USING (market,code)
      ) AS snapshot_market_cap_mismatch_rows,
      (SELECT count(*) FILTER (WHERE price IS NULL OR price <= 0)::int FROM saved) AS invalid_price_rows,
      (SELECT count(*) FILTER (WHERE market_cap IS NULL OR market_cap <= 0)::int FROM saved) AS invalid_market_cap_rows,
      (SELECT count(*) FILTER (
        WHERE market IN ('AMS','NAS','NYS') AND trading_value IS DISTINCT FROM ${turnoverSql}
      )::int FROM saved) AS overseas_turnover_source_mismatch_rows,
      (SELECT count(*) FILTER (WHERE market_cap IS NOT NULL)::int FROM saved) AS market_cap_rows,
      (SELECT count(*)::int FROM (
        SELECT DISTINCT ON (h.market,h.code) h.market,h.code,h.name,h.price,h.change_rate,h.open,h.high,h.low,
          h.volume,h.trading_value,h.market_cap,h.listed_shares,h.currency,h.source,h.raw_payload,h.observed_at,h.fetched_at
        FROM instrument_fundamental_history h
        JOIN active a USING (market,code)
        WHERE h.fetched_at >= $1::timestamptz
        ORDER BY h.market,h.code,h.fetched_at DESC,h.id DESC
      ) latest
      LEFT JOIN instrument_fundamental_snapshots s USING (market,code)
      WHERE s.code IS NULL OR
        s.name IS DISTINCT FROM latest.name OR
        s.price IS DISTINCT FROM latest.price OR
        s.change_rate IS DISTINCT FROM latest.change_rate OR
        s.open IS DISTINCT FROM latest.open OR
        s.high IS DISTINCT FROM latest.high OR
        s.low IS DISTINCT FROM latest.low OR
        s.volume IS DISTINCT FROM latest.volume OR
        s.trading_value IS DISTINCT FROM latest.trading_value OR
        s.market_cap IS DISTINCT FROM latest.market_cap OR
        s.listed_shares IS DISTINCT FROM latest.listed_shares OR
        s.currency IS DISTINCT FROM latest.currency OR
        s.source IS DISTINCT FROM latest.source OR
        s.raw_payload IS DISTINCT FROM latest.raw_payload OR
        s.observed_at IS DISTINCT FROM latest.observed_at OR
        s.fetched_at IS DISTINCT FROM latest.fetched_at) AS snapshot_sync_mismatch_rows
  `, [timestamp]);
  const counts = verification.rows[0] as InstrumentFundamentalRefreshCounts;

  const [emptyQuoteShapes, successfulQuoteShapes, invalidMarketCapSamples] = await Promise.all([
    db.query(`
      WITH refreshed AS (
        SELECT DISTINCT market,code FROM instrument_fundamental_history WHERE fetched_at >= $1::timestamptz
      )
      SELECT u.market,u.code,u.name,c.status,c.parsed->>'rt_cd' AS rt_cd,c.parsed->>'msg_cd' AS msg_cd,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'last' AS quote_price,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'tomv' AS market_cap,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'tamt' AS current_turnover,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'pamt' AS previous_turnover,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'e_ordyn' AS trading_status,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'etyp_nm' AS product_type
      FROM us_common_stock_universe u
      LEFT JOIN refreshed r USING (market,code)
      LEFT JOIN us_price_detail_cache c USING (market,code)
      WHERE u.enabled=true AND r.code IS NULL
      ORDER BY u.market,u.code LIMIT 10
    `, [timestamp]),
    db.query(`
      WITH refreshed AS (
        SELECT DISTINCT market,code FROM instrument_fundamental_history WHERE fetched_at >= $1::timestamptz
      )
      SELECT u.market,u.code,u.name,c.status,c.parsed->>'rt_cd' AS rt_cd,c.parsed->>'msg_cd' AS msg_cd,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'last' AS quote_price,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'tomv' AS market_cap,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'tamt' AS current_turnover,
        COALESCE(c.parsed->'output',c.parsed->'output1',c.parsed->'output2')->>'pamt' AS previous_turnover
      FROM us_common_stock_universe u
      JOIN refreshed r USING (market,code)
      LEFT JOIN us_price_detail_cache c USING (market,code)
      ORDER BY u.market,u.code LIMIT 5
    `, [timestamp]),
    db.query(`
      WITH active AS (
        SELECT market,code FROM kr_common_stock_universe WHERE enabled=true
        UNION ALL
        SELECT market,code FROM us_common_stock_universe WHERE enabled=true
      )
      SELECT latest.market,latest.code,latest.name,latest.price,latest.market_cap,
        s.market_cap AS snapshot_market_cap,
        latest.raw_payload::jsonb->>'rt_cd' AS rt_cd,
        latest.raw_payload::jsonb->>'msg_cd' AS msg_cd,
        COALESCE(latest.raw_payload::jsonb->'output',latest.raw_payload::jsonb->'output1',latest.raw_payload::jsonb->'output2')->>'tomv' AS kis_market_cap,
        latest.fetched_at
      FROM (
        SELECT DISTINCT ON (h.market,h.code) h.* FROM instrument_fundamental_history h
        JOIN active a USING (market,code)
        WHERE h.fetched_at >= $1::timestamptz
        ORDER BY h.market,h.code,h.fetched_at DESC,h.id DESC
      ) latest
      LEFT JOIN instrument_fundamental_snapshots s USING (market,code)
      WHERE latest.market_cap IS NULL OR latest.market_cap <= 0
      ORDER BY latest.market,latest.code
      LIMIT 10
    `, [timestamp]),
  ]);

  return {
    ok: isInstrumentFundamentalRefreshComplete(counts),
    since: timestamp,
    ...counts,
    emptyQuoteShapeSamples: emptyQuoteShapes.rows,
    successfulQuoteShapeSamples: successfulQuoteShapes.rows,
    invalidMarketCapSamples: invalidMarketCapSamples.rows,
  };
}
