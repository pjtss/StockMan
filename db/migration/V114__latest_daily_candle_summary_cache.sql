CREATE TABLE IF NOT EXISTS kr_latest_daily_candles (
  market text NOT NULL,
  code text NOT NULL,
  candle_date text NOT NULL,
  open double precision,
  high double precision,
  low double precision,
  close double precision,
  volume double precision,
  fetched_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, code)
);

CREATE TABLE IF NOT EXISTS us_latest_daily_candles (
  market text NOT NULL,
  code text NOT NULL,
  candle_date text NOT NULL,
  open double precision,
  high double precision,
  low double precision,
  close double precision,
  volume double precision,
  fetched_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, code)
);
