-- Match the public market RSS and bullish RSS listing orders.
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_published_order_idx
  ON market_rss_articles (published_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_source_published_order_idx
  ON market_rss_articles (source, published_at DESC NULLS LAST, id DESC);

-- Match GET /api/bullish-rss ordering for both all-source and source-filtered reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_bullish_published_order_idx
  ON market_rss_bullish_articles (published_at DESC NULLS LAST, priority DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_bullish_source_published_order_idx
  ON market_rss_bullish_articles (source, published_at DESC NULLS LAST, priority DESC, id DESC);
