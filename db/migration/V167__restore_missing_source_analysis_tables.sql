-- Restore source-analysis tables still referenced by the SEC/RSS ingestion
-- and event materialization code. IF NOT EXISTS is safe where V141/V142 ran.
CREATE TABLE IF NOT EXISTS market_rss_llm_analyses (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  revision_hash TEXT NOT NULL,
  article_snapshot JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('POSITIVE', 'MIXED', 'NEUTRAL', 'NEGATIVE', 'INSUFFICIENT')),
  ticker TEXT,
  ticker_status TEXT CHECK (ticker_status IN ('NEW', 'EXISTING')),
  company_name TEXT,
  event_type TEXT NOT NULL,
  translated_title_ko TEXT NOT NULL,
  analysis_ko TEXT NOT NULL,
  evidence_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks_ko TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  notify BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (delivery_status IN ('NOT_REQUIRED', 'PENDING', 'SENDING', 'SENT', 'FAILED', 'UNCERTAIN')),
  discord_message_id TEXT,
  delivery_error TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_rss_llm_analyses_revision_unique UNIQUE (source, external_id, revision_hash),
  CONSTRAINT market_rss_llm_ticker_status_check CHECK ((ticker IS NULL AND ticker_status IS NULL) OR (ticker IS NOT NULL AND ticker_status IS NOT NULL)),
  CONSTRAINT market_rss_llm_positive_delivery_check CHECK (
    (notify = FALSE AND delivery_status = 'NOT_REQUIRED') OR
    (notify = TRUE AND decision = 'POSITIVE' AND ticker IS NOT NULL AND delivery_status <> 'NOT_REQUIRED')
  )
);
CREATE INDEX IF NOT EXISTS market_rss_llm_delivery_pending_idx
  ON market_rss_llm_analyses (analyzed_at, id) WHERE delivery_status = 'PENDING';
CREATE INDEX IF NOT EXISTS market_rss_llm_ticker_analyzed_idx
  ON market_rss_llm_analyses (ticker, analyzed_at DESC);
CREATE TABLE IF NOT EXISTS market_rss_llm_agent_state (
  state_key TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sec_codex_analysis_queue (
  accession TEXT PRIMARY KEY REFERENCES sec_submissions(accession) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  result JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_codex_analysis_queue_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS sec_codex_analysis_queue_status_idx
  ON sec_codex_analysis_queue (status, updated_at);
