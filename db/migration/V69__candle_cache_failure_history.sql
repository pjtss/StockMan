CREATE TABLE IF NOT EXISTS instrument_candle_cache_failures (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  error TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS instrument_candle_cache_failures_lookup_idx
  ON instrument_candle_cache_failures (market, code, timeframe, observed_at DESC);
CREATE INDEX IF NOT EXISTS instrument_candle_cache_failures_recent_idx
  ON instrument_candle_cache_failures (observed_at DESC);
