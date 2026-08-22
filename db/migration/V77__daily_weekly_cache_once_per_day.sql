-- Daily and weekly candle freshness are both evaluated once per day.
UPDATE feature_module_settings
SET settings = jsonb_set(settings, '{intervalSeconds}', '86400'::jsonb, true),
    updated_at = NOW()
WHERE module_key IN ('us-daily-cache', 'kr-daily-cache')
  AND COALESCE(CASE WHEN settings->>'intervalSeconds' ~ '^[0-9]+$' THEN (settings->>'intervalSeconds')::int ELSE 0 END, 0) < 86400;
