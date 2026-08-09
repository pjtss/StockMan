-- Repair rows ingested before the stricter SEC/StockTitan classifier was deployed.

-- Compact SPAC unit/warrant symbols are not ordinary common-share tickers.
UPDATE market_rss_articles
SET detected_ticker = NULL
WHERE source = 'SEC_EDGAR'
  AND detected_ticker ~* '(AF|UF|WF)$';

-- SEC RSS entries without a resolvable common-share ticker are retained for
-- audit/debugging but must not be sent as stock alerts.
UPDATE market_rss_articles
SET notify_eligible = FALSE,
    updated_at = NOW()
WHERE source = 'SEC_EDGAR'
  AND detected_ticker IS NULL
  AND notify_eligible = TRUE;

-- "Acquisition Corp." is frequently only a legal issuer name.  Item 5.02
-- officer changes and Item 8.01/9.01 boilerplate are not acquisition events.
UPDATE market_rss_articles
SET category = 'GENERAL',
    priority = 20,
    notify_eligible = FALSE,
    event_direction = 'NEUTRAL',
    matched_terms = '{}'::text[],
    updated_at = NOW()
WHERE source = 'SEC_EDGAR'
  AND title ~* 'Acquisition Corp\.'
  AND summary !~* '(Item[[:space:]]+1\.01|material definitive agreement|business combination|acquisition[[:space:]]+(of|agreement)|merger[[:space:]]+with|offering|financing|clinical|approval|contract|partnership)';

-- Backfill transient Discord failures created before the delivery queue was
-- introduced.  This makes the existing GFR-style 503 failures recoverable
-- without sending old backlog articles through the normal ingestion path.
INSERT INTO discord_delivery_queue (external_id, channel_key, payload)
SELECT
  'MARKET_RSS:' || id::text || ':' || GREATEST(notification_attempts + 1, 1)::text,
  'MARKET_RSS',
  jsonb_build_object(
    'content', concat(
      '🚨 **해외시장 RSS 속보**', E'\n',
      CASE WHEN link <> '' THEN '[**' || COALESCE(NULLIF(translated_title, ''), title) || '**](' || link || ')' ELSE '**' || COALESCE(NULLIF(translated_title, ''), title) || '**' END, E'\n',
      '출처: ', source,
      CASE WHEN detected_ticker IS NOT NULL THEN E'\n티커: ' || detected_ticker ELSE '' END
    ),
    'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)
  )
FROM market_rss_articles
WHERE source = 'STOCKTITAN'
  AND notification_status = 'FAILED'
  AND notify_eligible = TRUE
  AND notification_attempts < 5
  AND last_error ~* 'Discord HTTP (408|425|429|5[0-9]{2})'
ON CONFLICT (external_id) DO NOTHING;
