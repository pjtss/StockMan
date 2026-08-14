-- V60 is already deployed in production. Keep all follow-up compatibility
-- changes in a new migration so Flyway validation remains deterministic.
ALTER TABLE us_daily_price_candles DROP CONSTRAINT IF EXISTS us_daily_price_candles_market_code_candle_date_key;
ALTER TABLE kr_daily_price_candles DROP CONSTRAINT IF EXISTS kr_daily_price_candles_market_code_candle_date_key;
DROP INDEX IF EXISTS us_daily_price_candles_market_code_candle_date_key;
DROP INDEX IF EXISTS kr_daily_price_candles_market_code_candle_date_key;

DELETE FROM us_daily_price_candles older
USING us_daily_price_candles newer
WHERE older.market = newer.market
  AND older.code = newer.code
  AND older.timeframe = newer.timeframe
  AND older.candle_date = newer.candle_date
  AND (older.fetched_at, older.id) < (newer.fetched_at, newer.id);
DELETE FROM kr_daily_price_candles older
USING kr_daily_price_candles newer
WHERE older.market = newer.market
  AND older.code = newer.code
  AND older.timeframe = newer.timeframe
  AND older.candle_date = newer.candle_date
  AND (older.fetched_at, older.id) < (newer.fetched_at, newer.id);

CREATE UNIQUE INDEX IF NOT EXISTS us_daily_price_candles_market_code_timeframe_date_unique
  ON us_daily_price_candles (market, code, timeframe, candle_date);
CREATE UNIQUE INDEX IF NOT EXISTS kr_daily_price_candles_market_code_timeframe_date_unique
  ON kr_daily_price_candles (market, code, timeframe, candle_date);
