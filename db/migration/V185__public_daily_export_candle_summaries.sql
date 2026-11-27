CREATE TABLE public_daily_export_candle_summaries (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  compact_candles JSON NOT NULL,
  full_candles JSON NOT NULL,
  latest_candle_date TEXT NOT NULL,
  data_updated_at TIMESTAMPTZ NOT NULL,
  returned_count INTEGER NOT NULL CHECK (returned_count BETWEEN 1 AND 20),
  PRIMARY KEY (market, code)
);

WITH normalized AS (
  SELECT market, code, candle_date, open, high, low, close, volume,
         CASE
           WHEN trading_value > '-Infinity'::NUMERIC AND trading_value < 'Infinity'::NUMERIC
             THEN trading_value::DOUBLE PRECISION
           ELSE close * volume
         END AS trading_value,
         fetched_at
    FROM us_recent_daily_candles
  UNION ALL
  SELECT market, code, candle_date, open, high, low, close, volume,
         CASE
           WHEN trading_value > '-Infinity' AND trading_value < 'Infinity'
             THEN trading_value::DOUBLE PRECISION
           ELSE close * volume
         END AS trading_value,
         fetched_at
    FROM kr_recent_daily_candles
), aggregates AS (
  SELECT market, code,
         json_agg(
           json_build_array(
             candle_date, open, high, low, close, volume, trading_value,
             to_char(fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) ORDER BY candle_date ASC
         ) AS compact_candles,
         json_agg(
           json_build_object(
             'date', candle_date,
             'open', open,
             'high', high,
             'low', low,
             'close', close,
             'volume', volume,
             'tradingValue', trading_value,
             'fetchedAt', to_char(fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) ORDER BY candle_date ASC
         ) AS full_candles,
         MAX(candle_date) AS latest_candle_date,
         MAX(fetched_at) AS data_updated_at,
         COUNT(*)::INTEGER AS returned_count
    FROM normalized
   GROUP BY market, code
)
INSERT INTO public_daily_export_candle_summaries
  (market, code, compact_candles, full_candles, latest_candle_date, data_updated_at, returned_count)
SELECT market, code, compact_candles, full_candles, latest_candle_date, data_updated_at, returned_count
  FROM aggregates;
