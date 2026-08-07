CREATE TABLE IF NOT EXISTS us_turnover_watchlist_alert_state (
  instrument_id BIGINT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ,
  last_fingerprint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS us_turnover_watchlist_alert_state_sent_idx
  ON us_turnover_watchlist_alert_state (last_sent_at);
