CREATE TABLE IF NOT EXISTS us_instrument_universe_candles (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'D',
  candle_date TEXT NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, code, timeframe, candle_date)
);
CREATE INDEX IF NOT EXISTS us_instrument_universe_candles_lookup_idx ON us_instrument_universe_candles (market, code, timeframe, candle_date DESC);

CREATE TABLE IF NOT EXISTS kr_instrument_universe_candles (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'D',
  candle_date TEXT NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL DEFAULT 'KIS',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, code, timeframe, candle_date)
);
CREATE INDEX IF NOT EXISTS kr_instrument_universe_candles_lookup_idx ON kr_instrument_universe_candles (market, code, timeframe, candle_date DESC);

INSERT INTO us_instrument_universe_candles (market, code, timeframe, candle_date, open, high, low, close, volume, source, fetched_at)
SELECT c.market, c.code, c.timeframe, c.candle_date, c.open, c.high, c.low, c.close, c.volume, c.source, c.fetched_at
FROM us_daily_price_candles c
JOIN us_instrument_universe u ON u.market = c.market AND u.code = c.code
ON CONFLICT (market, code, timeframe, candle_date) DO NOTHING;

INSERT INTO kr_instrument_universe_candles (market, code, timeframe, candle_date, open, high, low, close, volume, source, fetched_at)
SELECT c.market, c.code, c.timeframe, c.candle_date, c.open, c.high, c.low, c.close, c.volume, c.source, c.fetched_at
FROM kr_daily_price_candles c
JOIN kr_instrument_universe u ON u.market = c.market AND u.code = c.code
ON CONFLICT (market, code, timeframe, candle_date) DO NOTHING;
