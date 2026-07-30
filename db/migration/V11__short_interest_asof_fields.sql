ALTER TABLE us_short_interest_snapshots
  ADD COLUMN IF NOT EXISTS short_volume_as_of TEXT,
  ADD COLUMN IF NOT EXISTS short_interest_as_of TEXT;
