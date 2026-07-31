CREATE TABLE IF NOT EXISTS market_rss_articles (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  translated_title TEXT,
  translated_summary TEXT,
  translation_status TEXT NOT NULL DEFAULT 'PENDING',
  translation_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  notification_status TEXT NOT NULL DEFAULT 'PENDING',
  notification_attempts INTEGER NOT NULL DEFAULT 0,
  notified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_rss_articles_source_external_unique UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS market_rss_articles_notification_idx ON market_rss_articles (notification_status, created_at);
