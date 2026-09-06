-- Accumulation and daily scanners only read active common stocks.
-- Partial indexes keep inactive/special instruments out of the candidate scan.
CREATE INDEX IF NOT EXISTS kr_common_stock_universe_daily_scan_idx
  ON kr_common_stock_universe (market, code)
  WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK';

CREATE INDEX IF NOT EXISTS us_common_stock_universe_daily_scan_idx
  ON us_common_stock_universe (market, code)
  WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK';
