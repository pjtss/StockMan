CREATE TABLE IF NOT EXISTS kis_token_issuance_history (
  id BIGSERIAL PRIMARY KEY,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kis_token_issuance_history_issued_at
  ON kis_token_issuance_history (issued_at DESC);
