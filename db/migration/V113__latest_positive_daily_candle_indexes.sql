-- Optimizes the screener's per-instrument latest daily-candle lookup.
CREATE INDEX IF NOT EXISTS kr_latest_positive_daily_candle_idx
  ON kr_instrument_universe_candles (market, code, candle_date DESC)
  WHERE timeframe = 'D' AND volume > 0;

CREATE INDEX IF NOT EXISTS us_latest_positive_daily_candle_idx
  ON us_instrument_universe_candles (market, code, candle_date DESC)
  WHERE timeframe = 'D' AND volume > 0;
