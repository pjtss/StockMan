CREATE TABLE IF NOT EXISTS us_turnover_ratio_snapshot_attempts (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  raw_price TEXT,
  raw_rate TEXT,
  snapshot_status TEXT NOT NULL,
  market_cap DOUBLE PRECISION,
  trading_value DOUBLE PRECISION,
  turnover_ratio DOUBLE PRECISION,
  error_message TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS us_turnover_ratio_attempt_market_code_time
  ON us_turnover_ratio_snapshot_attempts (market, code, observed_at DESC);
