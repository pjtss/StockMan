-- Timeframe-aware cache migration (D=day, W=week, M=month).
-- Keep this migration safe for installations where an older cache migration
-- was skipped or partially applied. Existing tables are never overwritten.
CREATE TABLE IF NOT EXISTS us_daily_price_candles (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  candle_date TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timeframe TEXT NOT NULL DEFAULT 'D'
);
CREATE TABLE IF NOT EXISTS kr_daily_price_candles (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'KRX',
  code TEXT NOT NULL,
  candle_date TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timeframe TEXT NOT NULL DEFAULT 'D'
);
ALTER TABLE us_daily_price_candles ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'D';
ALTER TABLE kr_daily_price_candles ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'D';
ALTER TABLE us_daily_price_candles DROP CONSTRAINT IF EXISTS us_daily_price_candles_market_code_date_unique;
ALTER TABLE us_daily_price_candles DROP CONSTRAINT IF EXISTS us_daily_price_candles_market_code_candle_date_key;
ALTER TABLE kr_daily_price_candles DROP CONSTRAINT IF EXISTS kr_daily_price_candles_market_code_date_unique;
ALTER TABLE kr_daily_price_candles DROP CONSTRAINT IF EXISTS kr_daily_price_candles_market_code_candle_date_key;
DROP INDEX IF EXISTS us_daily_price_candles_market_code_date_unique;
DROP INDEX IF EXISTS us_daily_price_candles_market_code_candle_date_key;
DROP INDEX IF EXISTS kr_daily_price_candles_market_code_date_unique;
DROP INDEX IF EXISTS kr_daily_price_candles_market_code_candle_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS us_daily_price_candles_market_code_timeframe_date_unique ON us_daily_price_candles (market, code, timeframe, candle_date);
CREATE UNIQUE INDEX IF NOT EXISTS kr_daily_price_candles_market_code_timeframe_date_unique ON kr_daily_price_candles (market, code, timeframe, candle_date);
