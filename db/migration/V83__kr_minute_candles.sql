CREATE TABLE IF NOT EXISTS kr_minute_candles (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  candle_date TEXT NOT NULL,
  candle_time TEXT NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, code, candle_date, candle_time)
);
CREATE INDEX IF NOT EXISTS kr_minute_candles_lookup_idx ON kr_minute_candles (market, code, candle_date DESC, candle_time DESC);
