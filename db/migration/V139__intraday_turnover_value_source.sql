ALTER TABLE intraday_turnover_observations
  ADD COLUMN IF NOT EXISTS minute_trading_value_source TEXT NOT NULL DEFAULT 'UNKNOWN';
