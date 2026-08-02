CREATE TABLE IF NOT EXISTS us_short_metrics (
  id BIGSERIAL PRIMARY KEY,
  instrument_id BIGINT REFERENCES us_instruments(id),
  ticker TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  source TEXT NOT NULL,
  account_scope TEXT NOT NULL DEFAULT 'MARKET',
  status TEXT NOT NULL,
  as_of TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  short_volume DOUBLE PRECISION,
  total_volume DOUBLE PRECISION,
  short_volume_ratio DOUBLE PRECISION,
  short_interest DOUBLE PRECISION,
  days_to_cover DOUBLE PRECISION,
  available_qty INTEGER,
  locate_fee_rate_percent DOUBLE PRECISION,
  pressure_score INTEGER,
  pressure_level TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS us_short_metrics_instrument_observed_idx
  ON us_short_metrics (instrument_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS us_short_metrics_type_observed_idx
  ON us_short_metrics (metric_type, observed_at DESC);
