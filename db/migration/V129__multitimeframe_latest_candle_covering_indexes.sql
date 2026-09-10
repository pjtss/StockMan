-- Cover the latest W/M candle lookup used by stale detection and screeners.
-- The existing all-timeframe index remains the fallback for other queries.
CREATE INDEX IF NOT EXISTS kr_candles_multitimeframe_latest_cover_idx
  ON kr_instrument_universe_candles (market, code, timeframe, candle_date DESC)
  INCLUDE (fetched_at)
  WHERE timeframe IN ('W', 'M');

CREATE INDEX IF NOT EXISTS us_candles_multitimeframe_latest_cover_idx
  ON us_instrument_universe_candles (market, code, timeframe, candle_date DESC)
  INCLUDE (fetched_at)
  WHERE timeframe IN ('W', 'M');
