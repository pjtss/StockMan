DO $$
BEGIN
  IF to_regclass('public.automation_settings') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    INSERT INTO feature_module_settings (module_key, settings, updated_at)
    SELECT
      'us-scanners',
      jsonb_build_object('intervalSeconds', interval_seconds),
      NOW()
    FROM automation_settings
    WHERE key = 'global' AND interval_seconds IS NOT NULL
    ON CONFLICT (module_key) DO UPDATE
    SET settings = feature_module_settings.settings ||
        jsonb_build_object('intervalSeconds', EXCLUDED.settings->'intervalSeconds'),
        updated_at = NOW()
  $sql$;

  EXECUTE $sql$
    INSERT INTO feature_module_settings (module_key, settings, updated_at)
    SELECT
      'us-daily-indicators',
      jsonb_build_object(
        'featureSettings',
        jsonb_build_object(
          'evaluation',
          jsonb_build_object('mfiThreshold', mfi_threshold)
        )
      ),
      NOW()
    FROM automation_settings
    WHERE key = 'global' AND mfi_threshold IS NOT NULL
    ON CONFLICT (module_key) DO UPDATE
    SET settings = feature_module_settings.settings || jsonb_build_object(
          'featureSettings',
          COALESCE(feature_module_settings.settings->'featureSettings', '{}'::jsonb) || jsonb_build_object(
            'evaluation',
            COALESCE(feature_module_settings.settings->'featureSettings'->'evaluation', '{}'::jsonb) ||
              EXCLUDED.settings->'featureSettings'->'evaluation'
          )
        ),
        updated_at = NOW()
  $sql$;
END
$$;
