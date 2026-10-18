CREATE TABLE IF NOT EXISTS instrument_fundamental_refresh_jobs (
  id BIGSERIAL PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'PARTIAL', 'FAILED', 'SUCCESS', 'ABANDONED')),
  instrument_count INTEGER NOT NULL CHECK (instrument_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instrument_fundamental_refresh_jobs_resume_idx
  ON instrument_fundamental_refresh_jobs (scope_hash, created_at DESC)
  WHERE status IN ('RUNNING', 'PARTIAL', 'FAILED');

CREATE TABLE IF NOT EXISTS instrument_fundamental_refresh_items (
  job_id BIGINT NOT NULL REFERENCES instrument_fundamental_refresh_jobs(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, market, code),
  UNIQUE (job_id, ordinal)
);

CREATE INDEX IF NOT EXISTS instrument_fundamental_refresh_items_pending_idx
  ON instrument_fundamental_refresh_items (job_id, ordinal)
  WHERE status <> 'SUCCESS';
