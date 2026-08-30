CREATE TABLE IF NOT EXISTS debug_run_items (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  market TEXT,
  code TEXT,
  timeframe TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_category TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS debug_run_items_run_idx ON debug_run_items(run_id);
CREATE INDEX IF NOT EXISTS debug_run_items_error_idx ON debug_run_items(status, completed_at DESC);
