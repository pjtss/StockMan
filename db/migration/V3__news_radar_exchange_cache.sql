CREATE TABLE IF NOT EXISTS us_news_ticker_exchange_cache (
  ticker TEXT PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('NAS', 'NYS', 'AMS')),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS us_news_ticker_exchange_cache_validated_idx
  ON us_news_ticker_exchange_cache (validated_at DESC);

CREATE TABLE IF NOT EXISTS us_news_radar_events (
  external_id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  market TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS us_news_radar_events_status_updated_idx
  ON us_news_radar_events (status, updated_at DESC);
