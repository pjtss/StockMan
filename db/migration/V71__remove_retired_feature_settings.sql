-- Remove settings for feature modules retired with the legacy universe.
DELETE FROM feature_module_settings
WHERE module_key IN ('us-turnover-ratio', 'us-turnover-trend', 'us-vwap', 'us-short-borrow');
