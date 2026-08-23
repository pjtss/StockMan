CREATE TABLE IF NOT EXISTS us_minute_scan_universe (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT,
  rank INTEGER NOT NULL,
  change_rate NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market, code)
);
CREATE INDEX IF NOT EXISTS us_minute_scan_universe_market_rank_idx
  ON us_minute_scan_universe (market, rank);
