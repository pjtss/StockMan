ALTER TABLE market_rss_articles
  ADD COLUMN translation_attempted_at TIMESTAMPTZ;

UPDATE market_rss_articles
SET translation_attempted_at = updated_at
WHERE (translation_status = 'FAILED'
       OR (translation_status = 'SKIPPED' AND translation_skipped_reason = 'monthly_character_limit_reached'))
  AND translation_attempted_at IS NULL;
