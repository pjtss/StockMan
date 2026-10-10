CREATE TABLE IF NOT EXISTS sec_smallcap_common_stock_shares (
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  market_cap_usd DOUBLE PRECISION NOT NULL,
  price_usd DOUBLE PRECISION,
  shares_outstanding BIGINT NOT NULL,
  fact_end_date DATE NOT NULL,
  fact_filed_date DATE NOT NULL,
  fact_accession_number TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_smallcap_common_stock_shares_market_ticker_unique UNIQUE (market, ticker),
  CONSTRAINT sec_smallcap_common_stock_shares_positive_cap CHECK (market_cap_usd > 0 AND market_cap_usd < 100000000),
  CONSTRAINT sec_smallcap_common_stock_shares_positive_shares CHECK (shares_outstanding > 0)
);

CREATE INDEX IF NOT EXISTS sec_smallcap_common_stock_shares_cap_idx
  ON sec_smallcap_common_stock_shares (market_cap_usd, market, ticker);
