ALTER TABLE us_turnover_ratio_blacklist
  ADD COLUMN IF NOT EXISTS instrument_id BIGINT;

ALTER TABLE us_news_ticker_exchange_cache
  ADD COLUMN IF NOT EXISTS instrument_id BIGINT;

UPDATE us_news_ticker_exchange_cache c
SET instrument_id = i.id
FROM us_instruments i
WHERE i.market = c.market
  AND i.code = c.ticker
  AND c.instrument_id IS NULL;

UPDATE us_turnover_ratio_blacklist b
SET instrument_id = i.id
FROM us_instruments i
WHERE i.code = b.ticker
  AND b.instrument_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'us_turnover_ratio_blacklist_instrument_fk') THEN
    ALTER TABLE us_turnover_ratio_blacklist ADD CONSTRAINT us_turnover_ratio_blacklist_instrument_fk
      FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'us_news_ticker_exchange_cache_instrument_fk') THEN
    ALTER TABLE us_news_ticker_exchange_cache ADD CONSTRAINT us_news_ticker_exchange_cache_instrument_fk
      FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
  END IF;
END $$;
