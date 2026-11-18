-- V178 completed successfully, but readiness still found the operational
-- indexes in public with stale column definitions. Qualify every relation so
-- the repair cannot follow a deployment user's search_path to another schema.
DROP INDEX IF EXISTS public.kis_rate_limit_events_occurred_idx;
DROP INDEX IF EXISTS public.kis_rate_limit_events_endpoint_idx;
DROP INDEX IF EXISTS public.kis_rate_limit_events_incident_idx;

CREATE INDEX kis_rate_limit_events_occurred_idx
  ON public.kis_rate_limit_events (occurred_at DESC);
CREATE INDEX kis_rate_limit_events_endpoint_idx
  ON public.kis_rate_limit_events (endpoint, occurred_at DESC);
CREATE INDEX kis_rate_limit_events_incident_idx
  ON public.kis_rate_limit_events (incident_id, occurred_at DESC);
