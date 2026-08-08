-- Keep the persisted snapshot-attempt table aligned with the Drizzle schema.
-- The application records the product classification for every attempt, so
-- this column must exist before the automation starts writing new rows.
ALTER TABLE us_turnover_ratio_snapshot_attempts
  ADD COLUMN IF NOT EXISTS instrument_type TEXT NOT NULL DEFAULT 'COMMON_STOCK';
