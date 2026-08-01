ALTER TABLE us_short_interest_snapshots ADD COLUMN IF NOT EXISTS instrument_id BIGINT;
UPDATE us_short_interest_snapshots s SET instrument_id = i.id
FROM us_news_ticker_exchange_cache c
JOIN us_instruments i ON i.market = c.market AND i.code = s.ticker
WHERE c.ticker = s.ticker AND s.instrument_id IS NULL;
ALTER TABLE us_short_interest_snapshots ADD CONSTRAINT us_short_interest_snapshots_instrument_fk FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
