CREATE TABLE IF NOT EXISTS instrument_fundamental_history (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  price DOUBLE PRECISION,
  change_rate DOUBLE PRECISION,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  trading_value DOUBLE PRECISION,
  market_cap DOUBLE PRECISION,
  shares_outstanding DOUBLE PRECISION,
  currency TEXT,
  source TEXT NOT NULL,
  raw_payload TEXT NOT NULL DEFAULT '',
  observed_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT instrument_fundamental_history_market_code_observed_unique UNIQUE (market, code, observed_at)
);
CREATE INDEX IF NOT EXISTS instrument_fundamental_history_lookup_idx ON instrument_fundamental_history (market, code, observed_at DESC);
