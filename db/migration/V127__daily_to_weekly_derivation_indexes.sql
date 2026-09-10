-- Cover the daily rows used by coverage checks and local weekly projection.
-- The projection accepts any non-null close, including rows with zero volume.
CREATE INDEX IF NOT EXISTS kr_daily_weekly_derivation_idx
  ON kr_instrument_universe_candles (market, code, candle_date)
  INCLUDE (open, high, low, close, volume)
  WHERE timeframe = 'D' AND close IS NOT NULL;

CREATE INDEX IF NOT EXISTS us_daily_weekly_derivation_idx
  ON us_instrument_universe_candles (market, code, candle_date)
  INCLUDE (open, high, low, close, volume)
  WHERE timeframe = 'D' AND close IS NOT NULL;
