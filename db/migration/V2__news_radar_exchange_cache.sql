CREATE TABLE IF NOT EXISTS us_news_ticker_exchange_cache (
  ticker TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('NAS', 'NYS', 'AMS')),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS us_news_ticker_exchange_cache_validated_idx
  ON us_news_ticker_exchange_cache (validated_at DESC);
