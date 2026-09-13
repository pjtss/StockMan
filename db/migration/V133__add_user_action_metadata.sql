ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS feature TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'request';
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS resource TEXT;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS result TEXT;
CREATE INDEX IF NOT EXISTS request_logs_feature_idx ON request_logs(feature, created_at DESC);
