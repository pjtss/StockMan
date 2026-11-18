-- V172 used IF NOT EXISTS, which preserves indexes with stale definitions.
-- Rebuild the three operational indexes concurrently so readiness sees the
-- expected columns without blocking normal reads and writes.
DROP INDEX CONCURRENTLY IF EXISTS kis_rate_limit_events_occurred_idx;
DROP INDEX CONCURRENTLY IF EXISTS kis_rate_limit_events_endpoint_idx;
DROP INDEX CONCURRENTLY IF EXISTS kis_rate_limit_events_incident_idx;

CREATE INDEX CONCURRENTLY IF NOT EXISTS kis_rate_limit_events_occurred_idx
  ON kis_rate_limit_events (occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS kis_rate_limit_events_endpoint_idx
  ON kis_rate_limit_events (endpoint, occurred_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS kis_rate_limit_events_incident_idx
  ON kis_rate_limit_events (incident_id, occurred_at DESC);
