-- Refresh workers filter and aggregate by timeframe/fetched_at and latest candle date.
-- These additive indexes avoid repeatedly scanning the full multi-timeframe cache.
CREATE INDEX IF NOT EXISTS kr_candle_refresh_idx
  ON kr_instrument_universe_candles (timeframe, fetched_at, market, code);

CREATE INDEX IF NOT EXISTS kr_candle_latest_date_idx
  ON kr_instrument_universe_candles (timeframe, candle_date DESC);
