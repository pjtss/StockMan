UPDATE us_free_float_snapshots f SET instrument_id = i.id
FROM us_news_ticker_exchange_cache c
, us_instruments i
WHERE c.ticker = f.ticker
  AND i.market = c.market
  AND i.code = f.ticker
  AND f.instrument_id IS NULL;
