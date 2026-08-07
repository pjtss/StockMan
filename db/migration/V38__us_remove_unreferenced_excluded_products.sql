-- New product metadata is filtered before insertion. Clean up only rows that
-- have no dependent records; referenced rows are retained for FK integrity.
DO $$
DECLARE
  condition_sql TEXT := '';
  relation_name TEXT;
  relation_names TEXT[] := ARRAY[
    'us_turnover_watchlist', 'us_daily_breakout_watchlist',
    'us_trade_intensity_ticks', 'us_turnover_ratio_snapshots',
    'us_turnover_ratio_snapshot_attempts', 'us_news_radar_events',
    'us_free_float_snapshots', 'us_short_interest_snapshots',
    'short_borrow_snapshots'
  ];
BEGIN
  FOREACH relation_name IN ARRAY relation_names LOOP
    IF to_regclass(relation_name) IS NOT NULL THEN
      condition_sql := condition_sql || format(' AND NOT EXISTS (SELECT 1 FROM %I r WHERE r.instrument_id = i.id)', relation_name);
    END IF;
  END LOOP;
  EXECUTE 'DELETE FROM us_instruments i WHERE (i.is_etf OR i.is_leveraged OR i.is_inverse OR i.is_derivative_product OR i.instrument_type <> ''COMMON_STOCK'') AND i.manual_product_action IS DISTINCT FROM ''ALLOW''' || condition_sql;
END $$;
