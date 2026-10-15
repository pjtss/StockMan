CREATE INDEX IF NOT EXISTS automation_runs_module_non_skipped_started_idx
  ON automation_runs (module_key, started_at DESC)
  WHERE status <> 'SKIPPED';

CREATE INDEX IF NOT EXISTS automation_runs_module_success_started_idx
  ON automation_runs (module_key, started_at DESC)
  INCLUDE (finished_at)
  WHERE status = 'SUCCESS';
