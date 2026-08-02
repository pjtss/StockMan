INSERT INTO us_instruments (market, code, name)
SELECT 'AMS', upper(x.code), ''
FROM us_turnover_symbols s
JOIN LATERAL jsonb_array_elements_text(s.symbols) x(code) ON TRUE
WHERE s.key = 'default'
ON CONFLICT (market, code) DO NOTHING;

INSERT INTO us_turnover_watchlist (instrument_id)
SELECT i.id
FROM us_turnover_symbols s
JOIN LATERAL jsonb_array_elements_text(s.symbols) x(code) ON TRUE
JOIN us_instruments i ON i.market = 'AMS' AND i.code = upper(x.code)
ON CONFLICT (instrument_id) DO UPDATE SET enabled = TRUE, updated_at = NOW();
