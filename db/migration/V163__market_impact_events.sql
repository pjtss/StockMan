CREATE TABLE IF NOT EXISTS market_impact_events (
  event_id TEXT PRIMARY KEY,
  event_date DATE NOT NULL,
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  direction TEXT NOT NULL,
  impact_horizon TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_event JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_impact_events_market_check CHECK (market IN ('KR', 'US')),
  CONSTRAINT market_impact_events_status_check CHECK (status IN ('REPORTED', 'CONFIRMED_SCHEDULED', 'ESTIMATED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT market_impact_events_direction_check CHECK (direction IN ('POSITIVE', 'NEGATIVE', 'MIXED', 'UNCERTAIN')),
  CONSTRAINT market_impact_events_horizon_check CHECK (impact_horizon IN ('INTRADAY', 'SHORT_TERM', 'LONG_TERM', 'UNKNOWN')),
  CONSTRAINT market_impact_events_confidence_check CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW'))
);

CREATE INDEX IF NOT EXISTS market_impact_events_date_idx
  ON market_impact_events (event_date DESC, market, ticker);
CREATE INDEX IF NOT EXISTS market_impact_events_ticker_date_idx
  ON market_impact_events (ticker, event_date DESC);
