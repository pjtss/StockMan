-- V137/V140 were introduced after some production databases had already
-- advanced beyond those versions. OCI deliberately ignores out-of-order
-- migrations, so reassert the required schema at the current forward edge.
ALTER TABLE market_rss_articles
  ADD COLUMN IF NOT EXISTS translation_attempted_at TIMESTAMPTZ;

ALTER TABLE market_rss_articles
  ADD COLUMN IF NOT EXISTS translation_candidate_title TEXT;

UPDATE market_rss_articles
SET translation_attempted_at = updated_at
WHERE (translation_status = 'FAILED'
       OR (translation_status = 'SKIPPED' AND translation_skipped_reason = 'monthly_character_limit_reached'))
  AND translation_attempted_at IS NULL;
