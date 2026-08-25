ALTER TABLE kr_instrument_universe_candles
  ADD COLUMN IF NOT EXISTS candle_time TIMESTAMPTZ;

ALTER TABLE us_instrument_universe_candles
  ADD COLUMN IF NOT EXISTS candle_time TIMESTAMPTZ;

COMMENT ON COLUMN kr_instrument_universe_candles.candle_time IS
  'Provider candle reference timestamp; NULL when KIS daily response supplies date only.';
COMMENT ON COLUMN us_instrument_universe_candles.candle_time IS
  'Provider candle reference timestamp; NULL when KIS daily response supplies date only.';
