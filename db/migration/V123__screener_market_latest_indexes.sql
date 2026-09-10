-- Speed up the market-level latest daily candle aggregation used by the
-- configurable screener, especially when an as-of date is supplied.
CREATE INDEX IF NOT EXISTS kr_candles_screener_market_latest_idx
  ON kr_instrument_universe_candles (market, candle_date DESC, code)
  INCLUDE (fetched_at, close, high, low, volume)
  WHERE timeframe = 'D' AND volume > 0;

CREATE INDEX IF NOT EXISTS us_candles_screener_market_latest_idx
  ON us_instrument_universe_candles (market, candle_date DESC, code)
  INCLUDE (fetched_at, close, high, low, volume)
  WHERE timeframe = 'D' AND volume > 0;
