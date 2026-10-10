CREATE TABLE IF NOT EXISTS sec_smallcap_share_review (
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  cik TEXT,
  review_status TEXT NOT NULL,
  shares_outstanding BIGINT,
  as_of_date DATE,
  filing_form TEXT,
  filing_date DATE,
  accession_number TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_smallcap_share_review_market_ticker_unique UNIQUE (market, ticker),
  CONSTRAINT sec_smallcap_share_review_status_check CHECK (review_status IN ('VERIFIED', 'REVIEW_REQUIRED', 'UNAVAILABLE')),
  CONSTRAINT sec_smallcap_share_review_verified_count_check CHECK (review_status <> 'VERIFIED' OR shares_outstanding > 0),
  CONSTRAINT sec_smallcap_share_review_unverified_null_check CHECK (review_status = 'VERIFIED' OR shares_outstanding IS NULL)
);

CREATE INDEX IF NOT EXISTS sec_smallcap_share_review_status_idx
  ON sec_smallcap_share_review (review_status, market, ticker);
