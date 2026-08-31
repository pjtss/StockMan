ALTER TABLE translation_usage_monthly
  ADD COLUMN IF NOT EXISTS alerted_thresholds INTEGER[] NOT NULL DEFAULT '{}';
