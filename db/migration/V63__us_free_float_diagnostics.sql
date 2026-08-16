CREATE TABLE IF NOT EXISTS us_free_float_diagnostics (
  ticker TEXT PRIMARY KEY,
  market TEXT,
  failure_reason TEXT,
  fmp_status INTEGER,
  fmp_error TEXT,
  fmp_response JSONB,
  sec_status INTEGER,
  sec_error TEXT,
  sec_response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
