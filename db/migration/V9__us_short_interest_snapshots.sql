CREATE TABLE IF NOT EXISTS us_short_interest_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  short_volume DOUBLE PRECISION,
  total_volume DOUBLE PRECISION,
  short_volume_ratio DOUBLE PRECISION,
  short_interest DOUBLE PRECISION,
  days_to_cover DOUBLE PRECISION,
  as_of TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT us_short_interest_ticker_source_asof_unique UNIQUE (ticker, source, as_of)
);
CREATE INDEX IF NOT EXISTS us_short_interest_ticker_fetched_idx ON us_short_interest_snapshots (ticker, fetched_at DESC);
