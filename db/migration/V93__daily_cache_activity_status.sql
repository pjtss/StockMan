ALTER TABLE kr_common_stock_universe ADD COLUMN IF NOT EXISTS daily_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE us_common_stock_universe ADD COLUMN IF NOT EXISTS daily_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS kr_common_stock_universe_daily_active_idx ON kr_common_stock_universe (daily_active, enabled, market, code);
CREATE INDEX IF NOT EXISTS us_common_stock_universe_daily_active_idx ON us_common_stock_universe (daily_active, enabled, market, code);
