CREATE TABLE IF NOT EXISTS request_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  user_key TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS request_logs_created_idx ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS request_logs_user_idx ON request_logs(user_key, created_at DESC);
