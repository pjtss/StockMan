CREATE TABLE IF NOT EXISTS us_obv_divergence_snapshot (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  as_of_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  scan_status TEXT NOT NULL CHECK (scan_status IN ('COMPLETE', 'PARTIAL')),
  universe_count INTEGER NOT NULL CHECK (universe_count >= 0),
  evaluated_count INTEGER NOT NULL CHECK (evaluated_count >= 0 AND evaluated_count <= universe_count),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE us_obv_divergence_snapshot IS
  'Latest US common-stock daily OBV divergence scan; the public GET reads this precomputed snapshot only.';
