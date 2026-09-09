CREATE TABLE IF NOT EXISTS us_top_rising_snapshots (
  id BIGSERIAL PRIMARY KEY,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_top_n INTEGER NOT NULL DEFAULT 100,
  ok BOOLEAN NOT NULL,
  markets JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS us_top_rising_snapshot_items (
  snapshot_id BIGINT NOT NULL REFERENCES us_top_rising_snapshots(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT,
  rank INTEGER NOT NULL,
  change_rate NUMERIC,
  is_common_stock BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (snapshot_id, market, code)
);
CREATE INDEX IF NOT EXISTS us_top_rising_snapshot_items_rank_idx
  ON us_top_rising_snapshot_items (snapshot_id, rank, market);
CREATE INDEX IF NOT EXISTS us_top_rising_snapshots_collected_at_idx
  ON us_top_rising_snapshots (collected_at DESC);
