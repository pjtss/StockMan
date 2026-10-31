CREATE INDEX market_impact_events_order_idx
  ON market_impact_events (event_date DESC, published_at DESC NULLS LAST, event_id);
