CREATE TABLE IF NOT EXISTS us_breaking_news_discord_delivery (
  external_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS us_breaking_news_discord_delivery_updated_idx
  ON us_breaking_news_discord_delivery (updated_at DESC);
