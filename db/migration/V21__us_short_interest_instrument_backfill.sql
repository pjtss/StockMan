UPDATE us_short_interest_snapshots s SET instrument_id = i.id
FROM us_news_ticker_exchange_cache c, us_instruments i
WHERE c.ticker = s.ticker AND i.market = c.market AND i.code = s.ticker AND s.instrument_id IS NULL;
