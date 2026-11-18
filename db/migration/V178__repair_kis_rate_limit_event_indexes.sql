-- V172 used IF NOT EXISTS, which preserves indexes with stale definitions.
-- OCI stops the application and scheduler before Flyway, so replace these
-- indexes with regular DDL inside the quiesced maintenance window.
DROP INDEX IF EXISTS kis_rate_limit_events_occurred_idx;
DROP INDEX IF EXISTS kis_rate_limit_events_endpoint_idx;
DROP INDEX IF EXISTS kis_rate_limit_events_incident_idx;

CREATE INDEX IF NOT EXISTS kis_rate_limit_events_occurred_idx
  ON kis_rate_limit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS kis_rate_limit_events_endpoint_idx
  ON kis_rate_limit_events (endpoint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS kis_rate_limit_events_incident_idx
  ON kis_rate_limit_events (incident_id, occurred_at DESC);
