CREATE TABLE IF NOT EXISTS us_trade_intensity_ticks (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  trade_time TEXT NOT NULL,
  price DOUBLE PRECISION,
  change_rate DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  total_volume DOUBLE PRECISION,
  market_type TEXT,
  bid DOUBLE PRECISION,
  ask DOUBLE PRECISION,
  intensity DOUBLE PRECISION,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT us_trade_intensity_ticks_identity_unique UNIQUE (market, code, trade_time, price, volume, total_volume)
);
CREATE INDEX IF NOT EXISTS us_trade_intensity_ticks_code_time_idx
  ON us_trade_intensity_ticks (market, code, fetched_at DESC);
