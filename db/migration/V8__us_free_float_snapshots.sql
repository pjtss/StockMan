CREATE TABLE IF NOT EXISTS us_free_float_snapshots (
  ticker TEXT PRIMARY KEY,
  float_shares DOUBLE PRECISION NOT NULL,
  outstanding_shares DOUBLE PRECISION,
  free_float_percent DOUBLE PRECISION,
  as_of TEXT,
  source TEXT NOT NULL DEFAULT 'FMP',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS us_free_float_snapshots_fetched_idx ON us_free_float_snapshots (fetched_at DESC);
