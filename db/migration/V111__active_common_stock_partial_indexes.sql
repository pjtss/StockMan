-- Keep active common-stock lookups fast without splitting active and
-- inactive instruments into separate tables.
-- Daily-active-specific indexes remain separate for daily scanner queries.
CREATE INDEX IF NOT EXISTS kr_common_stock_universe_active_common_idx
  ON kr_common_stock_universe (market, code)
  WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK';

CREATE INDEX IF NOT EXISTS us_common_stock_universe_active_common_idx
  ON us_common_stock_universe (market, code)
  WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK';
