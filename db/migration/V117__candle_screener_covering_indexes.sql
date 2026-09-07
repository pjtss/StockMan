-- Cover the historical candle columns read by the screener's per-symbol
-- ordered scans while keeping the source table authoritative.
CREATE INDEX IF NOT EXISTS kr_candles_screener_cover_idx
  ON kr_instrument_universe_candles (market, code, timeframe, candle_date)
  INCLUDE (open, high, low, close, volume, fetched_at)
  WHERE volume > 0;

CREATE INDEX IF NOT EXISTS us_candles_screener_cover_idx
  ON us_instrument_universe_candles (market, code, timeframe, candle_date)
  INCLUDE (open, high, low, close, volume, fetched_at)
  WHERE volume > 0;
