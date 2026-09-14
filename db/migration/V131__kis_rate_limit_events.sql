CREATE TABLE IF NOT EXISTS kis_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  tick_id TEXT,
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  market TEXT,
  tr_id TEXT NOT NULL,
  http_status INTEGER,
  kis_rt_cd TEXT,
  kis_msg_cd TEXT,
  kis_msg1_code TEXT,
  limit_type TEXT NOT NULL,
  limit_scope TEXT NOT NULL,
  observed_tps NUMERIC,
  configured_tps NUMERIC NOT NULL DEFAULT 10,
  retry_after_ms INTEGER,
  backoff_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  breaker_state TEXT,
  queued_count INTEGER,
  inflight_count INTEGER,
  budget_remaining NUMERIC,
  incident_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recovered_at TIMESTAMPTZ,
  recovery_status TEXT
);
CREATE INDEX IF NOT EXISTS kis_rate_limit_events_occurred_idx ON kis_rate_limit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS kis_rate_limit_events_endpoint_idx ON kis_rate_limit_events(endpoint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS kis_rate_limit_events_incident_idx ON kis_rate_limit_events(incident_id, occurred_at DESC);
