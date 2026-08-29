CREATE TABLE IF NOT EXISTS us_common_stock_universe (LIKE us_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
CREATE TABLE IF NOT EXISTS us_special_instrument_universe (LIKE us_instrument_universe INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE);
ALTER TABLE us_common_stock_universe ADD CONSTRAINT us_common_stock_universe_market_code_unique UNIQUE (market, code);
ALTER TABLE us_special_instrument_universe ADD CONSTRAINT us_special_instrument_universe_market_code_unique UNIQUE (market, code);

INSERT INTO us_common_stock_universe SELECT * FROM us_instrument_universe WHERE instrument_type = 'COMMON_STOCK' AND NOT is_etf AND NOT is_warrant AND NOT is_derivative AND NOT is_dr AND NOT is_leveraged AND NOT is_inverse;
INSERT INTO us_special_instrument_universe SELECT * FROM us_instrument_universe WHERE NOT (instrument_type = 'COMMON_STOCK' AND NOT is_etf AND NOT is_warrant AND NOT is_derivative AND NOT is_dr AND NOT is_leveraged AND NOT is_inverse);

DELETE FROM us_instrument_universe_candles c WHERE NOT EXISTS (SELECT 1 FROM us_common_stock_universe u WHERE u.market = c.market AND u.code = c.code);

-- Keep the legacy physical table temporarily so LIKE-copied identity defaults
-- remain valid; all new reads/writes use the split tables or compatibility view.
ALTER TABLE us_instrument_universe RENAME TO us_instrument_universe_legacy;
CREATE VIEW us_instrument_universe AS SELECT * FROM us_common_stock_universe UNION ALL SELECT * FROM us_special_instrument_universe;
CREATE INDEX IF NOT EXISTS us_common_stock_universe_enabled_idx ON us_common_stock_universe (enabled, market, code);
CREATE INDEX IF NOT EXISTS us_special_instrument_universe_enabled_idx ON us_special_instrument_universe (enabled, market, code);
