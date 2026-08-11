CREATE TEMP TABLE kr_invalid_instruments AS
SELECT market, code
FROM kr_instruments
WHERE market = 'KRX' AND code !~ '^[0-9]{6}$';

DELETE FROM kr_daily_price_candles c
USING kr_invalid_instruments x
WHERE c.market = x.market AND c.code = x.code;

DELETE FROM kr_market_snapshots s
USING kr_invalid_instruments x
WHERE s.market = x.market AND s.code = x.code;

DELETE FROM kr_instruments i
USING kr_invalid_instruments x
WHERE i.market = x.market AND i.code = x.code;
