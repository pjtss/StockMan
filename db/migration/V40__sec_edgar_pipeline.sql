CREATE TABLE IF NOT EXISTS sec_companies (
  cik TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tickers TEXT[] NOT NULL DEFAULT '{}',
  exchanges TEXT[] NOT NULL DEFAULT '{}',
  sic TEXT,
  source_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sec_submissions (
  accession TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date DATE NOT NULL,
  report_date DATE,
  primary_document TEXT NOT NULL DEFAULT '',
  primary_doc_description TEXT,
  items TEXT,
  acceptance_datetime TEXT,
  filing_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  classified_category TEXT,
  classified_direction TEXT,
  classified_score INTEGER,
  matched_terms TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sec_submissions_cik_filing_idx ON sec_submissions(cik, filing_date);
CREATE INDEX IF NOT EXISTS sec_submissions_form_date_idx ON sec_submissions(form, filing_date);
CREATE TABLE IF NOT EXISTS sec_filing_events (
  accession TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  category TEXT NOT NULL,
  direction TEXT NOT NULL,
  score INTEGER NOT NULL,
  matched_terms TEXT[] NOT NULL DEFAULT '{}',
  body_excerpt TEXT NOT NULL DEFAULT '',
  financing_amount_usd DOUBLE PRECISION,
  dilution_risk TEXT,
  insider_action TEXT,
  discord_status TEXT NOT NULL DEFAULT 'PENDING',
  discord_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sec_xbrl_snapshots (
  cik TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
