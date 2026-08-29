ALTER TABLE kr_instrument_universe_candles ADD COLUMN IF NOT EXISTS period_end_date TEXT;
ALTER TABLE us_instrument_universe_candles ADD COLUMN IF NOT EXISTS period_end_date TEXT;

UPDATE kr_instrument_universe_candles c
SET period_end_date = CASE c.timeframe
  WHEN 'W' THEN (SELECT MAX(d.candle_date) FROM kr_instrument_universe_candles d WHERE d.market=c.market AND d.code=c.code AND d.timeframe='D' AND date_trunc('week', d.candle_date::date)::date = date_trunc('week', c.candle_date::date)::date)
  WHEN 'M' THEN (SELECT MAX(d.candle_date) FROM kr_instrument_universe_candles d WHERE d.market=c.market AND d.code=c.code AND d.timeframe='D' AND date_trunc('month', d.candle_date::date)::date = date_trunc('month', c.candle_date::date)::date)
  ELSE c.candle_date
END
WHERE c.timeframe IN ('D','W','M');
