CREATE TABLE IF NOT EXISTS daily_cache_followup_retries (
  market TEXT NOT NULL,
  task TEXT NOT NULL CHECK (task IN ('BOLLINGER', 'GOLDEN_CROSS')),
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  succeeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, task)
);
CREATE INDEX IF NOT EXISTS daily_cache_followup_retries_due_idx
  ON daily_cache_followup_retries (status, next_attempt_at);
