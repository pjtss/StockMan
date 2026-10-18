ALTER TABLE instrument_fundamental_refresh_items
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS instrument_fundamental_refresh_items_retry_idx
  ON instrument_fundamental_refresh_items (job_id, next_attempt_at, ordinal)
  WHERE status = 'FAILED';
