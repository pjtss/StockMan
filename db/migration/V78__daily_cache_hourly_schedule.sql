-- The worker runs hourly; weekly/monthly freshness is evaluated inside each run.
UPDATE feature_module_settings
SET settings = jsonb_set(settings, '{intervalSeconds}', '3600'::jsonb, true),
    updated_at = NOW()
WHERE module_key IN ('us-daily-cache', 'kr-daily-cache')
  AND COALESCE(CASE WHEN settings->>'intervalSeconds' ~ '^[0-9]+$' THEN (settings->>'intervalSeconds')::int ELSE 0 END, 0) <> 3600;
