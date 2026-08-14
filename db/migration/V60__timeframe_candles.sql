ALTER TABLE us_daily_price_candles ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'D';
ALTER TABLE kr_daily_price_candles ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'D';
ALTER TABLE us_daily_price_candles DROP CONSTRAINT IF EXISTS us_daily_price_candles_market_code_date_unique;
ALTER TABLE kr_daily_price_candles DROP CONSTRAINT IF EXISTS kr_daily_price_candles_market_code_date_unique;
DROP INDEX IF EXISTS us_daily_price_candles_market_code_date_unique;
DROP INDEX IF EXISTS kr_daily_price_candles_market_code_date_unique;
CREATE UNIQUE INDEX IF NOT EXISTS us_daily_price_candles_market_code_timeframe_date_unique ON us_daily_price_candles (market, code, timeframe, candle_date);
CREATE UNIQUE INDEX IF NOT EXISTS kr_daily_price_candles_market_code_timeframe_date_unique ON kr_daily_price_candles (market, code, timeframe, candle_date);
