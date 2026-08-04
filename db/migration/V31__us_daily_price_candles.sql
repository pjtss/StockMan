CREATE TABLE IF NOT EXISTS us_daily_price_candles (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  candle_date TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, code, candle_date)
);
CREATE INDEX IF NOT EXISTS us_daily_price_candles_lookup_idx ON us_daily_price_candles (market, code, candle_date DESC);
