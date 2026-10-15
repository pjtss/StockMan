CREATE TABLE IF NOT EXISTS health_probe_history (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  probe_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  ok BOOLEAN NOT NULL,
  error_code TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS health_probe_history_name_time_idx
  ON health_probe_history (probe_name, checked_at DESC)
  INCLUDE (duration_ms, ok, error_code);

CREATE INDEX IF NOT EXISTS health_probe_history_time_idx
  ON health_probe_history (checked_at DESC);
