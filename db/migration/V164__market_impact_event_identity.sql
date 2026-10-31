ALTER TABLE market_impact_events
  ADD COLUMN event_key TEXT NOT NULL DEFAULT 'DEFAULT'
  CHECK (event_key ~ '^[A-Z0-9._-]{1,64}$');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM market_impact_events
    GROUP BY market, source_type, source_id, ticker, event_type, event_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate market impact event identities exist; resolve them before applying V164';
  END IF;
END $$;

CREATE UNIQUE INDEX market_impact_events_identity_uidx
  ON market_impact_events (market, source_type, source_id, ticker, event_type, event_key);
