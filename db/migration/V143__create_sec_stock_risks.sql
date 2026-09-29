CREATE TABLE IF NOT EXISTS sec_stock_risks (
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  risk JSONB NOT NULL DEFAULT '{"schemaVersion":2,"items":[]}'::jsonb,
  market_cap_usd NUMERIC,
  market_cap_observed_at TIMESTAMPTZ,
  sec_cik TEXT,
  source_accessions TEXT[] NOT NULL DEFAULT '{}'::text[],
  source_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  risk_as_of DATE,
  source_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'LOCAL_API',
  PRIMARY KEY (market, ticker),
  CONSTRAINT sec_stock_risks_market_check CHECK (market IN ('NAS','NYS','AMS')),
  CONSTRAINT sec_stock_risks_risk_object_check CHECK (jsonb_typeof(risk) = 'object')
);
CREATE INDEX IF NOT EXISTS sec_stock_risks_ticker_idx ON sec_stock_risks (ticker);
CREATE INDEX IF NOT EXISTS sec_stock_risks_risk_gin_idx ON sec_stock_risks USING GIN (risk);
