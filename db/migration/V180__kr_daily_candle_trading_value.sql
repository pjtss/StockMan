ALTER TABLE kr_instrument_universe_candles
  ADD COLUMN IF NOT EXISTS trading_value DOUBLE PRECISION;

-- Recover official KIS turnover from raw rows collected before this column existed.
UPDATE kr_instrument_universe_candles
   SET trading_value = (raw_payload::jsonb ->> 'acml_tr_pbmn')::DOUBLE PRECISION
 WHERE trading_value IS NULL
   AND COALESCE(raw_payload, '') <> ''
   AND raw_payload::jsonb ? 'acml_tr_pbmn'
   AND (raw_payload::jsonb ->> 'acml_tr_pbmn') ~ '^[0-9]+(\.[0-9]+)?$';
