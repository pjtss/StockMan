CREATE TABLE IF NOT EXISTS kr_instruments (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'KRX',
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'KIS',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kr_instruments_market_code_unique UNIQUE (market, code)
);
CREATE INDEX IF NOT EXISTS kr_instruments_enabled_code_idx ON kr_instruments (enabled, code);

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
  CONSTRAINT kr_daily_price_candles_market_code_date_unique UNIQUE (market, code, candle_date)
);
CREATE INDEX IF NOT EXISTS kr_daily_price_candles_lookup_idx ON kr_daily_price_candles (market, code, candle_date);

CREATE TABLE IF NOT EXISTS kr_market_snapshots (
  id BIGSERIAL PRIMARY KEY, market TEXT NOT NULL DEFAULT 'KRX', code TEXT NOT NULL,
  price DOUBLE PRECISION, volume DOUBLE PRECISION, trading_value DOUBLE PRECISION,
  market_cap DOUBLE PRECISION, turnover_ratio DOUBLE PRECISION, change_rate DOUBLE PRECISION,
  raw_payload TEXT, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kr_market_snapshots_market_code_unique UNIQUE (market, code)
);
CREATE INDEX IF NOT EXISTS kr_market_snapshots_observed_idx ON kr_market_snapshots (observed_at);

INSERT INTO kr_instruments (market, code, name, source)
SELECT 'KRX', code, company, 'LEGACY_TOP_RISING' FROM top_rising_stocks
ON CONFLICT (market, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();
INSERT INTO kr_instruments (market, code, name, source)
SELECT 'KRX', code, company, 'LEGACY_TRADE_INTENSITY' FROM top_intensity_stocks
ON CONFLICT (market, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();
