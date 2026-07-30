ALTER TABLE us_short_interest_snapshots
  ADD COLUMN IF NOT EXISTS previous_short_interest DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS short_interest_change DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS short_interest_change_percent DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS average_daily_volume DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS threshold_listed BOOLEAN,
  ADD COLUMN IF NOT EXISTS threshold_as_of TEXT;
