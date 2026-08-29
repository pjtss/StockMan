CREATE TABLE IF NOT EXISTS kr_common_stock_universe (LIKE kr_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
CREATE TABLE IF NOT EXISTS kr_special_instrument_universe (LIKE kr_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
ALTER TABLE kr_common_stock_universe ADD CONSTRAINT kr_common_stock_universe_market_code_unique UNIQUE (market, code);
ALTER TABLE kr_special_instrument_universe ADD CONSTRAINT kr_special_instrument_universe_market_code_unique UNIQUE (market, code);

INSERT INTO kr_common_stock_universe
SELECT * FROM kr_instrument_universe
WHERE instrument_type = 'COMMON_STOCK'
  AND NOT is_suspended
  AND managed_issue_code <> 'Y';

INSERT INTO kr_special_instrument_universe
SELECT * FROM kr_instrument_universe
WHERE NOT (instrument_type = 'COMMON_STOCK'
  AND NOT is_suspended
  AND managed_issue_code = 'Y');

DELETE FROM kr_instrument_universe_candles c
WHERE NOT EXISTS (
  SELECT 1 FROM kr_common_stock_universe u
  WHERE u.market = c.market AND u.code = c.code
);

DROP TABLE kr_instrument_universe;
CREATE VIEW kr_instrument_universe AS
SELECT * FROM kr_common_stock_universe
UNION ALL
SELECT * FROM kr_special_instrument_universe;

CREATE INDEX IF NOT EXISTS kr_common_stock_universe_enabled_idx ON kr_common_stock_universe (enabled, market, code);
CREATE INDEX IF NOT EXISTS kr_special_instrument_universe_enabled_idx ON kr_special_instrument_universe (enabled, market, code);
