-- Indexes used by the DB-backed daily indicator context and common turnover
-- filter. They are additive and safe to apply to existing installations.
CREATE INDEX IF NOT EXISTS us_instruments_enabled_market_code_idx
  ON us_instruments (market, code)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS us_turnover_ratio_snapshot_latest_idx
  ON us_turnover_ratio_snapshots (market, code, observed_at DESC);
