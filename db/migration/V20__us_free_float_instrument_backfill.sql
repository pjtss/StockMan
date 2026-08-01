UPDATE us_free_float_snapshots f SET instrument_id = i.id
FROM us_news_ticker_exchange_cache c
JOIN us_instruments i ON i.market = c.market AND i.code = f.ticker
WHERE c.ticker = f.ticker AND f.instrument_id IS NULL;
