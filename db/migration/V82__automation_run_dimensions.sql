ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'FEATURE',
  ADD COLUMN IF NOT EXISTS market TEXT,
  ADD COLUMN IF NOT EXISTS timeframe TEXT,
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'AUTOMATION',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS automation_runs_dimensions_idx
  ON automation_runs (job_type, market, timeframe, started_at DESC);

CREATE INDEX IF NOT EXISTS automation_runs_trigger_idx
  ON automation_runs (trigger_type, started_at DESC);
