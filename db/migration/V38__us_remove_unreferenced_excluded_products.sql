-- New product metadata is filtered before insertion. Clean up only rows that
-- have no dependent records; referenced rows are retained for FK integrity.
DELETE FROM us_instruments i
WHERE (i.is_etf OR i.is_leveraged OR i.is_inverse OR i.is_derivative_product
       OR i.instrument_type <> 'COMMON_STOCK')
  AND i.manual_product_action IS DISTINCT FROM 'ALLOW'
  AND NOT EXISTS (SELECT 1 FROM us_turnover_watchlist w WHERE w.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_daily_breakout_watchlist b WHERE b.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_trade_intensity_ticks t WHERE t.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_turnover_ratio_snapshots s WHERE s.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_turnover_ratio_snapshot_attempts a WHERE a.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_news_radar_events n WHERE n.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_free_float_snapshots f WHERE f.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM us_short_interest_snapshots si WHERE si.instrument_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM short_borrow_snapshots sb WHERE sb.instrument_id = i.id);
