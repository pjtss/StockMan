ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS detected_ticker TEXT;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS event_direction TEXT NOT NULL DEFAULT 'NEUTRAL';
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS matched_terms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS financing_amount_usd DOUBLE PRECISION;
ALTER TABLE market_rss_articles ADD COLUMN IF NOT EXISTS dilution_risk TEXT;
