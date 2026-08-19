CREATE TABLE IF NOT EXISTS instrument_fundamental_snapshots (
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
  free_float_shares DOUBLE PRECISION,
  free_float_percent DOUBLE PRECISION,
  currency TEXT,
  source TEXT NOT NULL,
  raw_payload TEXT NOT NULL DEFAULT '',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT instrument_fundamental_snapshots_market_code_unique UNIQUE (market, code)
);
CREATE INDEX IF NOT EXISTS instrument_fundamental_snapshots_fetched_idx ON instrument_fundamental_snapshots (fetched_at DESC);
