ALTER TABLE market_rss_articles
  ADD COLUMN IF NOT EXISTS normalized_summary TEXT NOT NULL DEFAULT '';
