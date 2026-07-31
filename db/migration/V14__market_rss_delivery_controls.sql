ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 20;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS notify_eligible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS is_backlog BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS translation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS translation_error TEXT;
CREATE INDEX IF NOT EXISTS market_rss_articles_delivery_idx ON market_rss_articles (notify_eligible, is_backlog, notification_status, priority DESC, published_at);
UPDATE market_rss_articles
SET is_backlog = TRUE
WHERE notification_status = 'PENDING'
  AND published_at IS NOT NULL
  AND published_at < NOW() - INTERVAL '15 minutes';
UPDATE market_rss_articles
SET category = 'TRANSCRIPT', priority = 0, notify_eligible = FALSE
WHERE title ~* '(earnings call transcript|conference call transcript|quarterly results transcript)';
