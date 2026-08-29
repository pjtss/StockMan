ALTER TABLE us_instrument_universe_candles
  ADD COLUMN IF NOT EXISTS price_sign TEXT,
  ADD COLUMN IF NOT EXISTS price_diff NUMERIC,
  ADD COLUMN IF NOT EXISTS change_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS trading_value NUMERIC;
