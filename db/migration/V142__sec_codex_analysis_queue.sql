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
