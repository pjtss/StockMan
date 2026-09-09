-- The screener reads the newest fundamental snapshot for every candidate.
-- Keep the lookup ordered so PostgreSQL can stop after the first matching row.
CREATE INDEX IF NOT EXISTS instrument_fundamental_screener_latest_idx
  ON instrument_fundamental_snapshots (market, code, observed_at DESC, fetched_at DESC)
  INCLUDE (market_cap, shares_outstanding, currency);
