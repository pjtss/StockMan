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

CREATE INDEX IF NOT EXISTS debug_run_items_run_idx
  ON debug_run_items(run_id);
CREATE INDEX IF NOT EXISTS debug_run_items_error_idx
  ON debug_run_items(status, completed_at DESC);

CREATE TABLE IF NOT EXISTS debug_kis_calls (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  feature TEXT,
  market TEXT,
  code TEXT,
  timeframe TEXT,
  endpoint TEXT NOT NULL,
  tr_id TEXT NOT NULL,
  http_status INTEGER,
  failure TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL,
  retryable BOOLEAN NOT NULL DEFAULT false,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_kis_calls_observed_idx
  ON debug_kis_calls(observed_at DESC);
CREATE INDEX IF NOT EXISTS debug_kis_calls_request_idx
  ON debug_kis_calls(request_id);
