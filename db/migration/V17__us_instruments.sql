CREATE TABLE IF NOT EXISTS us_instruments (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  exchange TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT us_instruments_market_code_unique UNIQUE (market, code)
);
ALTER TABLE us_daily_breakout_watchlist ADD COLUMN IF NOT EXISTS instrument_id BIGINT;
INSERT INTO us_instruments (market, code, name)
SELECT DISTINCT market, code, MAX(name)
FROM us_daily_breakout_watchlist
GROUP BY market, code
ON CONFLICT (market, code) DO UPDATE SET name = CASE WHEN us_instruments.name = '' THEN EXCLUDED.name ELSE us_instruments.name END, updated_at = NOW();
UPDATE us_daily_breakout_watchlist w SET instrument_id = i.id FROM us_instruments i WHERE i.market = w.market AND i.code = w.code AND w.instrument_id IS NULL;
CREATE INDEX IF NOT EXISTS us_daily_breakout_watchlist_instrument_idx ON us_daily_breakout_watchlist (instrument_id);
ALTER TABLE us_daily_breakout_watchlist ADD CONSTRAINT us_daily_breakout_watchlist_instrument_fk FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
