CREATE TABLE IF NOT EXISTS investment_calendar_events (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT,
  company_name TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_end_date DATE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  source_url TEXT,
  external_id TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_calendar_events_source_external_unique UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS investment_calendar_events_date_type_idx ON investment_calendar_events (event_date, event_type);
CREATE INDEX IF NOT EXISTS investment_calendar_events_market_code_date_idx ON investment_calendar_events (market, code, event_date);
