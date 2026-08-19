INSERT INTO feature_module_settings (module_key, settings)
VALUES ('instrument-fundamentals', '{"enabled":true,"startTime":"00:00","endTime":"23:59","cooldownSeconds":86400,"intervalSeconds":86400,"activeDays":[1,2,3,4,5,6,0],"featureSettings":{}}'::jsonb)
ON CONFLICT (module_key) DO NOTHING;
