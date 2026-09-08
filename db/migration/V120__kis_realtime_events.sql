CREATE TABLE IF NOT EXISTS kis_realtime_events (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  channel TEXT NOT NULL,
  tr_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS kis_realtime_events_lookup_idx
  ON kis_realtime_events (market, code, channel, observed_at DESC);

CREATE INDEX IF NOT EXISTS kis_realtime_events_observed_idx
  ON kis_realtime_events (observed_at DESC);
