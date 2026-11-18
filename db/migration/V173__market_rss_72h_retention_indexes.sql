-- OCI stops the application and scheduler services before applying migrations.
-- Use transactional index builds during that maintenance window so a long-lived
-- snapshot cannot hold a concurrent build open beyond the deployment timeout.
CREATE INDEX IF NOT EXISTS market_rss_articles_retention_published_created_idx
  ON market_rss_articles (published_at ASC, created_at ASC)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_rss_bullish_retention_published_created_idx
  ON market_rss_bullish_articles (published_at ASC, created_at ASC)
  WHERE published_at IS NOT NULL;
