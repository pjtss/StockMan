-- OCI stops the application and scheduler services before applying migrations.
-- Use transactional index builds during that maintenance window so a long-lived
-- snapshot cannot hold a concurrent build open beyond the deployment timeout.
CREATE INDEX IF NOT EXISTS market_rss_articles_published_order_idx
  ON market_rss_articles (published_at DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS market_rss_articles_source_published_order_idx
  ON market_rss_articles (source, published_at DESC NULLS LAST, id DESC);

-- Match GET /api/bullish-rss ordering for both all-source and source-filtered reads.
CREATE INDEX IF NOT EXISTS market_rss_bullish_published_order_idx
  ON market_rss_bullish_articles (published_at DESC NULLS LAST, priority DESC, id DESC);

CREATE INDEX IF NOT EXISTS market_rss_bullish_source_published_order_idx
  ON market_rss_bullish_articles (source, published_at DESC NULLS LAST, priority DESC, id DESC);
