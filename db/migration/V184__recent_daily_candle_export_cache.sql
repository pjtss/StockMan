CREATE TABLE us_recent_daily_candles (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'D',
  candle_date TEXT NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume NUMERIC,
  trading_value NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (market, code, candle_date)
);

CREATE TABLE kr_recent_daily_candles (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'D',
  candle_date TEXT NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume NUMERIC,
  trading_value DOUBLE PRECISION,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (market, code, candle_date)
);

WITH ranked AS (
  SELECT c.market, c.code, c.timeframe, c.candle_date, c.open, c.high, c.low,
         c.close, c.volume, c.trading_value, c.fetched_at,
         ROW_NUMBER() OVER (PARTITION BY c.market, c.code ORDER BY c.candle_date DESC) AS row_number
    FROM us_instrument_universe_candles c
   WHERE c.timeframe = 'D'
     AND CASE WHEN c.candle_date ~ '^[0-9]{8}$' THEN
       substring(c.candle_date, 1, 4)::integer BETWEEN 1 AND 9999
       AND substring(c.candle_date, 5, 2)::integer BETWEEN 1 AND 12
       AND substring(c.candle_date, 7, 2)::integer BETWEEN 1 AND CASE substring(c.candle_date, 5, 2)::integer
         WHEN 2 THEN CASE WHEN substring(c.candle_date, 1, 4)::integer % 400 = 0 OR (substring(c.candle_date, 1, 4)::integer % 4 = 0 AND substring(c.candle_date, 1, 4)::integer % 100 <> 0) THEN 29 ELSE 28 END
         WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
       ELSE false END
     AND c.open > 0 AND c.high > 0 AND c.low > 0 AND c.close > 0 AND c.volume >= 0
     AND c.open < 'Infinity'::numeric AND c.high < 'Infinity'::numeric
     AND c.low < 'Infinity'::numeric AND c.close < 'Infinity'::numeric AND c.volume < 'Infinity'::numeric
     AND c.high >= GREATEST(c.open, c.low, c.close)
     AND c.low <= LEAST(c.open, c.high, c.close)
)
INSERT INTO us_recent_daily_candles
  (market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at)
SELECT market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at
  FROM ranked
 WHERE row_number <= 20;

WITH ranked AS (
  SELECT c.market, c.code, c.timeframe, c.candle_date, c.open, c.high, c.low,
         c.close, c.volume, c.trading_value, c.fetched_at,
         ROW_NUMBER() OVER (PARTITION BY c.market, c.code ORDER BY c.candle_date DESC) AS row_number
    FROM kr_instrument_universe_candles c
   WHERE c.timeframe = 'D'
     AND CASE WHEN c.candle_date ~ '^[0-9]{8}$' THEN
       substring(c.candle_date, 1, 4)::integer BETWEEN 1 AND 9999
       AND substring(c.candle_date, 5, 2)::integer BETWEEN 1 AND 12
       AND substring(c.candle_date, 7, 2)::integer BETWEEN 1 AND CASE substring(c.candle_date, 5, 2)::integer
         WHEN 2 THEN CASE WHEN substring(c.candle_date, 1, 4)::integer % 400 = 0 OR (substring(c.candle_date, 1, 4)::integer % 4 = 0 AND substring(c.candle_date, 1, 4)::integer % 100 <> 0) THEN 29 ELSE 28 END
         WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
       ELSE false END
     AND c.open > 0 AND c.high > 0 AND c.low > 0 AND c.close > 0 AND c.volume >= 0
     AND c.open < 'Infinity'::numeric AND c.high < 'Infinity'::numeric
     AND c.low < 'Infinity'::numeric AND c.close < 'Infinity'::numeric AND c.volume < 'Infinity'::numeric
     AND c.high >= GREATEST(c.open, c.low, c.close)
     AND c.low <= LEAST(c.open, c.high, c.close)
)
INSERT INTO kr_recent_daily_candles
  (market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at)
SELECT market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at
  FROM ranked
 WHERE row_number <= 20;

COMMENT ON TABLE us_recent_daily_candles IS
  'Latest 20 valid daily candles per ticker for the public gzip export read path.';
COMMENT ON TABLE kr_recent_daily_candles IS
  'Latest 20 valid daily candles per ticker for the public gzip export read path.';
