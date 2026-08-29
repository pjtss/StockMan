ALTER TABLE us_instrument_universe_candles
  ADD COLUMN IF NOT EXISTS raw_payload TEXT NOT NULL DEFAULT '';
