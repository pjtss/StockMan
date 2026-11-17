ALTER TABLE intraday_turnover_observations
  ADD COLUMN IF NOT EXISTS market_cap_observed_at TIMESTAMPTZ;

ALTER TABLE intraday_turnover_observations
  ADD COLUMN IF NOT EXISTS market_cap_fetched_at TIMESTAMPTZ;
