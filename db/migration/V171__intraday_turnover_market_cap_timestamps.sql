-- V138 may be absent from Flyway history when a database was baselined or had
-- already advanced past V138 while out-of-order migrations were disabled.
-- Recreate the durable relation at this forward edge before adding its new fields.
CREATE TABLE IF NOT EXISTS intraday_turnover_observations (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  session_date TEXT NOT NULL,
  bucket_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL,
  price DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  source_trading_value DOUBLE PRECISION,
  minute_trading_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  minute_trading_value_source TEXT NOT NULL DEFAULT 'UNKNOWN',
  market_cap DOUBLE PRECISION,
  rolling_trading_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  turnover_ratio DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'KIS',
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (market, code, session_date, bucket_at)
);

CREATE INDEX IF NOT EXISTS intraday_turnover_observations_lookup_idx
  ON intraday_turnover_observations (market, code, observed_at DESC);

CREATE INDEX IF NOT EXISTS intraday_turnover_observations_observed_idx
  ON intraday_turnover_observations (observed_at DESC);

ALTER TABLE intraday_turnover_observations
  ADD COLUMN IF NOT EXISTS market_cap_observed_at TIMESTAMPTZ;

ALTER TABLE intraday_turnover_observations
  ADD COLUMN IF NOT EXISTS market_cap_fetched_at TIMESTAMPTZ;
