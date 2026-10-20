ALTER TABLE instrument_fundamental_refresh_items
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN instrument_fundamental_refresh_items.last_attempt_at IS
  'Timestamp of the last provider attempt; null for legacy attempts whose exact time was not retained.';
