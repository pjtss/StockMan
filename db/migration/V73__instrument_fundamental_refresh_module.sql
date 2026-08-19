INSERT INTO feature_module_settings (module_key, enabled, start_time, end_time, cooldown_seconds, interval_seconds, active_days, feature_settings)
VALUES ('instrument-fundamentals', true, '00:00', '23:59', 86400, 86400, '[1,2,3,4,5,6,7]'::jsonb, '{}'::jsonb)
ON CONFLICT (module_key) DO NOTHING;
