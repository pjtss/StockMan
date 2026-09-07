-- Narrow partial indexes for the exact universe predicate used by the DB screener.
CREATE INDEX IF NOT EXISTS kr_common_stock_universe_daily_active_common_idx
  ON kr_common_stock_universe (market, code)
  WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK';

CREATE INDEX IF NOT EXISTS us_common_stock_universe_daily_active_common_idx
  ON us_common_stock_universe (market, code)
  WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK';

-- Cover the market-cap lookup used by screeners.
CREATE INDEX IF NOT EXISTS instrument_fundamental_screener_cover_idx
  ON instrument_fundamental_snapshots (market, code)
  INCLUDE (market_cap, shares_outstanding, currency, observed_at, fetched_at);
