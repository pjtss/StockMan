ALTER TABLE us_instruments ADD COLUMN IF NOT EXISTS instrument_type TEXT NOT NULL DEFAULT 'COMMON_STOCK';
CREATE INDEX IF NOT EXISTS us_instruments_type_enabled_idx ON us_instruments (instrument_type, enabled);
