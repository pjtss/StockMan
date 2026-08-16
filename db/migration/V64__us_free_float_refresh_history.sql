CREATE TABLE IF NOT EXISTS us_free_float_refresh_history (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  market TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  failure_reason TEXT,
  fmp_status INTEGER,
  sec_status INTEGER,
  saved BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS us_free_float_refresh_history_ticker_idx
  ON us_free_float_refresh_history (ticker, finished_at DESC);
CREATE INDEX IF NOT EXISTS us_free_float_refresh_history_finished_idx
  ON us_free_float_refresh_history (finished_at DESC);
