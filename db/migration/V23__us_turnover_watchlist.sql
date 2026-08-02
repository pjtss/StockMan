CREATE TABLE IF NOT EXISTS us_turnover_watchlist (
  instrument_id BIGINT PRIMARY KEY REFERENCES us_instruments(id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO us_turnover_watchlist (instrument_id)
SELECT i.id
FROM us_turnover_symbols s
JOIN LATERAL jsonb_array_elements_text(s.symbols) x(code) ON TRUE
JOIN us_instruments i ON i.code = upper(x.code)
WHERE s.key = 'default'
ON CONFLICT (instrument_id) DO UPDATE SET enabled = TRUE, updated_at = NOW();
