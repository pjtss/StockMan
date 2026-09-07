-- Candle scans consistently exclude zero-volume rows. Keep those rows in the
-- source table for auditability, but avoid scanning them in active lookups.
CREATE INDEX IF NOT EXISTS kr_candles_positive_volume_lookup_idx
  ON kr_instrument_universe_candles (market, timeframe, code, candle_date DESC)
  WHERE volume > 0;

CREATE INDEX IF NOT EXISTS us_candles_positive_volume_lookup_idx
  ON us_instrument_universe_candles (market, timeframe, code, candle_date DESC)
  WHERE volume > 0;
