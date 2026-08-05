CREATE TABLE IF NOT EXISTS us_intraday_vwap_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  session_date TEXT NOT NULL,
  vwap DOUBLE PRECISION,
  current_price DOUBLE PRECISION,
  total_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_trade_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  point_count INTEGER NOT NULL DEFAULT 0,
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS us_intraday_vwap_market_code_date_unique
  ON us_intraday_vwap_snapshots (market, code, session_date);
CREATE INDEX IF NOT EXISTS us_intraday_vwap_observed_idx
  ON us_intraday_vwap_snapshots (observed_at DESC);
