-- Keep the operational cadence in the database, including installations that
-- already have a persisted 12-hour default from before the six-hour policy.
UPDATE feature_module_settings
SET settings = jsonb_set(settings, '{intervalSeconds}', '21600'::jsonb, true),
    updated_at = NOW()
WHERE module_key IN ('us-daily-cache', 'kr-daily-cache')
  AND COALESCE(settings->>'intervalSeconds', '43200') = '43200';
