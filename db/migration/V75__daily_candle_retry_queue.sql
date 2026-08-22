CREATE TABLE IF NOT EXISTS instrument_candle_cache_retries (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, code, timeframe)
);
CREATE INDEX IF NOT EXISTS instrument_candle_cache_retries_due_idx ON instrument_candle_cache_retries (status, next_attempt_at);
