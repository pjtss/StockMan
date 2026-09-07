INSERT INTO kr_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at)
SELECT DISTINCT ON (market, code) market, code, candle_date, open, high, low, close, volume, fetched_at
FROM kr_instrument_universe_candles
WHERE timeframe = 'D' AND volume > 0 AND close IS NOT NULL
ORDER BY market, code, candle_date DESC, fetched_at DESC
ON CONFLICT (market, code) DO UPDATE SET
  candle_date = EXCLUDED.candle_date, open = EXCLUDED.open, high = EXCLUDED.high,
  low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume, fetched_at = EXCLUDED.fetched_at
WHERE kr_latest_daily_candles.candle_date <= EXCLUDED.candle_date;

INSERT INTO us_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at)
SELECT DISTINCT ON (market, code) market, code, candle_date, open, high, low, close, volume, fetched_at
FROM us_instrument_universe_candles
WHERE timeframe = 'D' AND volume > 0 AND close IS NOT NULL
ORDER BY market, code, candle_date DESC, fetched_at DESC
ON CONFLICT (market, code) DO UPDATE SET
  candle_date = EXCLUDED.candle_date, open = EXCLUDED.open, high = EXCLUDED.high,
  low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume, fetched_at = EXCLUDED.fetched_at
WHERE us_latest_daily_candles.candle_date <= EXCLUDED.candle_date;
