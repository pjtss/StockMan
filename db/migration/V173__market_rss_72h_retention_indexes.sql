-- Support 72-hour RSS cleanup scans while keeping undated rows on the V169 partial indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_retention_published_created_idx
  ON market_rss_articles (published_at ASC, created_at ASC)
  WHERE published_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_bullish_retention_published_created_idx
  ON market_rss_bullish_articles (published_at ASC, created_at ASC)
  WHERE published_at IS NOT NULL;
