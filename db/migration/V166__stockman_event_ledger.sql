-- Append-only event ledger. Existing RSS/SEC rows remain authoritative source records.
CREATE TABLE IF NOT EXISTS stockman_events (
  id BIGSERIAL PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  ticker TEXT,
  cik TEXT,
  accession_number TEXT,
  related_event_id BIGINT REFERENCES stockman_events(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
  event_status TEXT NOT NULL DEFAULT 'ANNOUNCED'
    CHECK (event_status IN ('ANNOUNCED', 'PLANNED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (accession_number IS NULL OR cik IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS stockman_events_ticker_published_idx ON stockman_events(ticker, published_at DESC);
CREATE INDEX IF NOT EXISTS stockman_events_accepted_idx ON stockman_events(accepted_at DESC);
CREATE INDEX IF NOT EXISTS stockman_events_related_idx ON stockman_events(related_event_id) WHERE related_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stockman_event_documents (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES stockman_events(id),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  cik TEXT,
  accession_number TEXT,
  exhibit_number TEXT,
  published_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  source_url TEXT NOT NULL DEFAULT '',
  content_hash TEXT,
  storage_reference TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS stockman_event_documents_event_idx ON stockman_event_documents(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stockman_event_documents_accession_idx ON stockman_event_documents(cik, accession_number) WHERE accession_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS stockman_event_analyses (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES stockman_events(id),
  analysis_version TEXT NOT NULL,
  revision_hash TEXT NOT NULL,
  bullish_grade TEXT NOT NULL CHECK (bullish_grade IN ('A', 'B', 'C', 'EXCLUDED')),
  bullish_reason TEXT NOT NULL DEFAULT '',
  bearish_reason TEXT NOT NULL DEFAULT '',
  dilution_risk TEXT,
  key_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  unknown_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, revision_hash)
);
CREATE INDEX IF NOT EXISTS stockman_event_analyses_latest_idx ON stockman_event_analyses(event_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS stockman_event_history (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES stockman_events(id),
  change_type TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stockman_event_history_event_idx ON stockman_event_history(event_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS stockman_event_metrics (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES stockman_events(id),
  metric_key TEXT NOT NULL,
  revision_hash TEXT NOT NULL,
  amount_value NUMERIC(38, 12),
  quantity_value NUMERIC(38, 12),
  currency TEXT,
  unit TEXT,
  as_of_date DATE,
  split_adjustment TEXT,
  calculation_formula TEXT,
  calculation_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_document_id BIGINT REFERENCES stockman_event_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, metric_key, revision_hash)
);
CREATE INDEX IF NOT EXISTS stockman_event_metrics_event_idx ON stockman_event_metrics(event_id, metric_key);

CREATE OR REPLACE FUNCTION stockman_event_append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stockman event audit rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stockman_event_analyses_append_only
  BEFORE UPDATE OR DELETE ON stockman_event_analyses
  FOR EACH ROW EXECUTE FUNCTION stockman_event_append_only_guard();
CREATE TRIGGER stockman_event_history_append_only
  BEFORE UPDATE OR DELETE ON stockman_event_history
  FOR EACH ROW EXECUTE FUNCTION stockman_event_append_only_guard();
CREATE TRIGGER stockman_event_metrics_append_only
  BEFORE UPDATE OR DELETE ON stockman_event_metrics
  FOR EACH ROW EXECUTE FUNCTION stockman_event_append_only_guard();
