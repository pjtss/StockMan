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
CREATE INDEX IF NOT EXISTS debug_kis_calls_observed_idx ON debug_kis_calls(observed_at DESC);
CREATE INDEX IF NOT EXISTS debug_kis_calls_request_idx ON debug_kis_calls(request_id);
