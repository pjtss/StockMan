CREATE TABLE IF NOT EXISTS us_exchange_trading_status (
  market text NOT NULL,
  symbol text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  status_type text NOT NULL,
  reason_code text,
  reason text,
  source_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (market, symbol, source)
);

CREATE INDEX IF NOT EXISTS us_exchange_trading_status_status_idx
  ON us_exchange_trading_status (status, status_type, market, symbol);

COMMENT ON TABLE us_exchange_trading_status IS
  'Latest US exchange trading halt and listing qualification observations. Missing directory symbols are never inferred as delisted.';
