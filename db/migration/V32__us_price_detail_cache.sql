CREATE TABLE IF NOT EXISTS us_price_detail_cache (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  status INTEGER NOT NULL,
  parsed JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, code)
);
CREATE INDEX IF NOT EXISTS us_price_detail_cache_fetched_idx ON us_price_detail_cache (fetched_at DESC);
