CREATE TABLE IF NOT EXISTS kr_common_stock_universe (LIKE kr_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
CREATE TABLE IF NOT EXISTS kr_special_instrument_universe (LIKE kr_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
-- LIKE ... INCLUDING DEFAULTS copies the legacy sequence reference. Detach it
-- before dropping the source table, then give each split table its own sequence.
CREATE SEQUENCE IF NOT EXISTS kr_common_stock_universe_id_seq;
CREATE SEQUENCE IF NOT EXISTS kr_special_instrument_universe_id_seq;
ALTER TABLE kr_common_stock_universe ALTER COLUMN id SET DEFAULT nextval('kr_common_stock_universe_id_seq');
ALTER TABLE kr_special_instrument_universe ALTER COLUMN id SET DEFAULT nextval('kr_special_instrument_universe_id_seq');
SELECT setval('kr_common_stock_universe_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM kr_common_stock_universe), 0) + 1, 1), false);
SELECT setval('kr_special_instrument_universe_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM kr_special_instrument_universe), 0) + 1, 1), false);
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
