-- Support cleanup for RSS rows whose feed did not provide a publication time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_published_retention_idx
  ON market_rss_articles (published_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_null_published_retention_idx
  ON market_rss_articles (created_at)
  WHERE published_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_bullish_articles_null_published_retention_idx
  ON market_rss_bullish_articles (created_at)
  WHERE published_at IS NULL;
