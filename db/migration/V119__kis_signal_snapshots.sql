CREATE TABLE IF NOT EXISTS kis_signal_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'KIS',
  observed_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS kis_signal_snapshots_lookup_idx
  ON kis_signal_snapshots (market, code, signal_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS kis_signal_snapshots_fetched_idx
  ON kis_signal_snapshots (fetched_at DESC);
