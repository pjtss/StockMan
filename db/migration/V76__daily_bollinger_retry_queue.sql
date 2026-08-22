CREATE TABLE IF NOT EXISTS daily_bollinger_cache_retries (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, zone)
);
CREATE INDEX IF NOT EXISTS daily_bollinger_cache_retries_due_idx ON daily_bollinger_cache_retries (status, next_attempt_at);
