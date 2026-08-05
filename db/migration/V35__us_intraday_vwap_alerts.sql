CREATE TABLE IF NOT EXISTS us_intraday_vwap_alerts (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  session_date TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT us_intraday_vwap_alert_market_code_date_unique UNIQUE (market, code, session_date)
);
