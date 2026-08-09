-- Reclassify historical SEC RSS rows that were stored before the
-- SEC-specific event text classifier was enabled.  A resolvable common-share
-- ticker is required for notification eligibility; filings without one stay
-- visible for audit/debugging but remain excluded from alerts.

UPDATE market_rss_articles
SET
  category = CASE
    WHEN summary ~* '\moffering\M|registered[[:space:]]+direct|convertible|warrants?|financing|unregistered[[:space:]]+sales'
      THEN 'FINANCING'
    ELSE 'ACTIONABLE'
  END,
  priority = 100,
  notify_eligible = TRUE,
  event_direction = CASE
    WHEN summary ~* '\moffering\M|registered[[:space:]]+direct|convertible|warrants?|financing|unregistered[[:space:]]+sales'
      THEN 'MIXED'
    ELSE 'POSITIVE'
  END,
  matched_terms = CASE
    WHEN summary ~* 'Item[[:space:]]+1\.01|material[[:space:]]+definitive[[:space:]]+agreement'
      THEN ARRAY['SEC Item 1.01']::text[]
    WHEN summary ~* 'business[[:space:]]+combination|acquisition|merger'
      THEN ARRAY['SEC acquisition']::text[]
    WHEN summary ~* 'clinical|approval|contract|partnership'
      THEN ARRAY['SEC event']::text[]
    ELSE matched_terms
  END,
  dilution_risk = CASE
    WHEN summary ~* '\moffering\M|registered[[:space:]]+direct|convertible|warrants?|financing|unregistered[[:space:]]+sales'
      THEN 'HIGH'
    ELSE 'UNKNOWN'
  END,
  updated_at = NOW()
WHERE source = 'SEC_EDGAR'
  AND category = 'GENERAL'
  AND detected_ticker IS NOT NULL
  AND summary ~* 'Item[[:space:]]+1\.01|material[[:space:]]+definitive[[:space:]]+agreement|business[[:space:]]+combination|acquisition|merger|clinical|approval|contract|partnership|offering|registered[[:space:]]+direct|convertible|warrants?|financing|unregistered[[:space:]]+sales'
  AND summary !~* 'Item[[:space:]]+1\.02|Item[[:space:]]+2\.03|Item[[:space:]]+3\.02';
